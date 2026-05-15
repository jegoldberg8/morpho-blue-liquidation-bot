import { chainConfigs } from "@morpho-blue-liquidation-bot/config";
import type { DataProvider } from "@morpho-blue-liquidation-bot/data-providers";
import type { LiquidityVenue } from "@morpho-blue-liquidation-bot/liquidity-venues";
import type { Pricer } from "@morpho-blue-liquidation-bot/pricers";
import {
  AccrualPosition,
  ChainAddresses,
  getChainAddresses,
  type IMarketParams,
  MarketUtils,
  PreLiquidationPosition,
} from "@morpho-org/blue-sdk";
import { executorAbi } from "executooor-viem";
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  LocalAccount,
  maxUint256,
  parseUnits,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import {
  estimateGas,
  getBlockNumber,
  getGasPrice,
  readContract,
  simulateCalls,
  writeContract,
} from "viem/actions";

import {
  MarketsFetchingCooldownMechanism,
  PositionLiquidationCooldownMechanism,
} from "./utils/cooldownMechanisms.js";
import { fetchWhitelistedVaults } from "./utils/fetch-whitelisted-vaults.js";
import { Flashbots } from "./utils/flashbots.js";
import { LiquidationEncoder } from "./utils/LiquidationEncoder.js";
import { DEFAULT_LIQUIDATION_BUFFER_BPS, WAD, wMulDown } from "./utils/maths.js";
import { priceCache } from "./utils/priceCache.js";
import { sendLiquidationAlert } from "./utils/telegram.js";

export interface LiquidationBotInputs {
  logTag: string;
  chainId: number;
  client: WalletClient<Transport, Chain, Account>;
  wNative: Address;
  vaultWhitelist: Address[] | "morpho-api" | "all";
  additionalMarketsWhitelist: Hex[];
  executorAddress: Address;
  treasuryAddress: Address;
  dataProvider: DataProvider;
  liquidityVenues: LiquidityVenue[];
  alwaysRealizeBadDebt: boolean;
  pricers?: Pricer[];
  positionLiquidationCooldownMechanism?: PositionLiquidationCooldownMechanism;
  marketsFetchingCooldownMechanism: MarketsFetchingCooldownMechanism;
  flashbotAccount?: LocalAccount;
  skipSimulation?: boolean;
  minCollateralUsd?: number;
}

export class LiquidationBot {
  private logTag: string;
  private chainId: number;
  private client: WalletClient<Transport, Chain, Account>;
  private chainAddresses: ChainAddresses;
  private wNative: Address;
  private vaultWhitelist: Address[] | "morpho-api" | "all";
  private additionalMarketsWhitelist: Hex[];
  private executorAddress: Address;
  private treasuryAddress: Address;
  private dataProvider: DataProvider;
  private liquidityVenues: LiquidityVenue[];
  private pricers?: Pricer[];
  private positionLiquidationCooldownMechanism?: PositionLiquidationCooldownMechanism;
  private marketsFetchingCooldownMechanism: MarketsFetchingCooldownMechanism;
  private flashbotAccount?: LocalAccount;
  private coveredMarkets: Hex[];
  private alwaysRealizeBadDebt: boolean;
  private skipSimulation: boolean;
  private minCollateralUsd: number;
  private decimalsCache: Record<string, number> = {};

  constructor(inputs: LiquidationBotInputs) {
    this.logTag = inputs.logTag;
    this.chainId = inputs.chainId;
    this.client = inputs.client;
    this.chainAddresses = getChainAddresses(inputs.chainId);
    this.wNative = inputs.wNative;
    this.vaultWhitelist = inputs.vaultWhitelist;
    this.additionalMarketsWhitelist = inputs.additionalMarketsWhitelist;
    this.executorAddress = inputs.executorAddress;
    this.treasuryAddress = inputs.treasuryAddress;
    this.dataProvider = inputs.dataProvider;
    this.liquidityVenues = inputs.liquidityVenues;
    this.pricers = inputs.pricers;
    this.positionLiquidationCooldownMechanism = inputs.positionLiquidationCooldownMechanism;
    this.marketsFetchingCooldownMechanism = inputs.marketsFetchingCooldownMechanism;
    this.flashbotAccount = inputs.flashbotAccount;
    this.coveredMarkets = [];
    this.alwaysRealizeBadDebt = inputs.alwaysRealizeBadDebt;
    this.skipSimulation = inputs.skipSimulation ?? false;
    this.minCollateralUsd = inputs.minCollateralUsd ?? 0;
  }

  async run() {
    await this.fetchMarkets();

    const { liquidatablePositions, preLiquidatablePositions } =
      await this.dataProvider.fetchLiquidatablePositions(this.client, this.coveredMarkets);

    const viable = liquidatablePositions.filter((p) => {
      const collateralToken = p.market.params.collateralToken;
      const price = priceCache.getPrice(this.chainId, collateralToken);
      if (price === undefined) return false;
      if (this.minCollateralUsd > 0) {
        const decimals = priceCache.getDecimals(this.chainId, collateralToken);
        const usd = parseFloat(formatUnits(p.seizableCollateral ?? 0n, decimals)) * price;
        if (usd < this.minCollateralUsd) return false;
      }
      return true;
    });

    const filtered = liquidatablePositions.length - viable.length;
    if (viable.length > 0) {
      console.log(`${this.logTag}Found ${viable.length} viable positions (${filtered} filtered)`);
    } else if (liquidatablePositions.length > 0) {
      console.log(
        `${this.logTag}${liquidatablePositions.length} liquidatable but all filtered (dust/unpriced)`,
      );
    }

    for (const position of viable) {
      await this.liquidate(position);
    }
    for (const position of preLiquidatablePositions) {
      await this.preLiquidate(position);
    }
  }

  private async liquidate(position: AccrualPosition) {
    const marketParams = position.market.params;
    const seizableCollateral = position.seizableCollateral ?? 0n;
    const badDebtPosition = seizableCollateral === position.collateral;

    const marketId = MarketUtils.getMarketId(marketParams);

    if (
      this.positionLiquidationCooldownMechanism?.hasPositionChanged(
        marketId,
        position.user,
        seizableCollateral,
      )
    ) {
      this.positionLiquidationCooldownMechanism.clearCooldown(marketId, position.user);
    }
    if (!this.checkCooldown(marketId, position.user)) return;

    // Skip positions where collateral token has no known price (junk/test tokens)
    // and skip dust positions under minCollateralUsd
    const cachedPrice = priceCache.getPrice(this.chainId, marketParams.collateralToken);
    if (cachedPrice === undefined) return;
    if (this.minCollateralUsd > 0) {
      const decimals = priceCache.getDecimals(this.chainId, marketParams.collateralToken);
      const collateralUsd = parseFloat(formatUnits(seizableCollateral, decimals)) * cachedPrice;
      if (collateralUsd < this.minCollateralUsd) return;
    }

    console.log(
      `${this.logTag}Attempting ${position.user} on ${marketId} (seizable: ${seizableCollateral})`,
    );

    const reducedCollateral = this.decreaseSeizableCollateral(seizableCollateral, badDebtPosition);

    const { client, executorAddress } = this;

    const encoder = new LiquidationEncoder(executorAddress, client);

    const swapResult = await this.convertCollateralToLoan(marketParams, reducedCollateral, encoder);
    if (!swapResult) {
      console.log(`${this.logTag}No swap route for ${position.user} on ${marketId}`);
      this.positionLiquidationCooldownMechanism?.cooldownPosition(
        marketId,
        position.user,
        seizableCollateral,
      );
      return;
    }

    encoder.erc20Approve(marketParams.loanToken, this.chainAddresses.morpho, maxUint256);

    encoder.morphoBlueLiquidate(
      this.chainAddresses.morpho,
      {
        loanToken: marketParams.loanToken,
        collateralToken: marketParams.collateralToken,
        oracle: marketParams.oracle,
        irm: marketParams.irm,
        lltv: BigInt(marketParams.lltv),
      },
      position.user,
      seizableCollateral,
      0n,
      encoder.flush(),
    );
    encoder.erc20Skim(marketParams.loanToken, this.treasuryAddress);

    const calls = encoder.flush();

    try {
      const balanceBefore = await readContract(this.client, {
        address: marketParams.loanToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [this.client.account.address],
      });

      const result = await this.handleTx(encoder, calls, marketParams, badDebtPosition);

      if (result === false) {
        console.log(`${this.logTag}ℹ️ Skipped ${position.user} on ${marketId} (not profitable)`);
      } else if (result) {
        console.log(`${this.logTag}Liquidated ${position.user} on ${marketId}\ntx: ${result}`);
        void sendLiquidationAlert({
          logTag: this.logTag,
          user: position.user,
          marketId,
          txHash: result as Hex,
          loanToken: marketParams.loanToken,
          balanceBefore,
          client: this.client,
        });
      }
    } catch (error) {
      console.error(`${this.logTag}Failed to liquidate ${position.user} on ${marketId}`, error);
    }
  }

  private async preLiquidate(position: PreLiquidationPosition) {
    const marketParams = position.market.params;
    const seizableCollateral = this.decreaseSeizableCollateral(
      position.seizableCollateral ?? 0n,
      false,
    );

    if (!this.checkCooldown(MarketUtils.getMarketId(marketParams), position.user)) return;

    const { client, executorAddress } = this;

    const encoder = new LiquidationEncoder(executorAddress, client);

    if (!(await this.convertCollateralToLoan(marketParams, seizableCollateral, encoder))) return;

    encoder.erc20Approve(marketParams.loanToken, position.preLiquidation, maxUint256);

    encoder.preLiquidate(
      position.preLiquidation,
      position.user,
      seizableCollateral,
      0n,
      encoder.flush(),
    );
    encoder.erc20Skim(marketParams.loanToken, this.treasuryAddress);

    const calls = encoder.flush();

    try {
      const success = await this.handleTx(encoder, calls, marketParams, false);

      if (success)
        console.log(
          `${this.logTag}Pre-liquidated ${position.user} on ${MarketUtils.getMarketId(marketParams)}`,
        );
      else
        console.log(
          `${this.logTag}ℹ️ Skipped ${position.user} on ${MarketUtils.getMarketId(marketParams)} (not profitable)`,
        );
    } catch (error) {
      console.error(
        `${this.logTag}Failed to pre-liquidate ${position.user} on ${MarketUtils.getMarketId(marketParams)}`,
        error,
      );
    }
  }

  private async handleTx(
    encoder: LiquidationEncoder,
    calls: Hex[],
    marketParams: IMarketParams,
    badDebtPosition: boolean,
  ) {
    const functionData = {
      abi: executorAbi,
      functionName: "exec_606BaXt",
      args: [calls],
    } as const;

    let profitable: boolean | undefined;

    if (this.skipSimulation) {
      // Simulation skipped — execute directly
      profitable = true;
    } else {
      try {
        const [{ results }, gasPrice] = await Promise.all([
          simulateCalls(this.client, {
            account: this.client.account.address,
            calls: [
              {
                to: marketParams.loanToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [this.client.account.address],
              },
              { to: encoder.address, ...functionData },
              {
                to: marketParams.loanToken,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [this.client.account.address],
              },
            ],
          }),
          getGasPrice(this.client),
        ]);

        if (results[1].status !== "success") {
          console.warn(`${this.logTag}Transaction failed in simulation: ${results[1].error}`);
          return;
        }

        profitable = await this.checkProfit(
          marketParams.loanToken,
          {
            beforeTx: results[0].result,
            afterTx: results[2].result,
          },
          {
            used: results[1].gasUsed,
            price: gasPrice,
          },
          badDebtPosition,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("does not exist")) {
          // Fallback for chains that don't support eth_simulateV1 (e.g. HyperEVM)
          const execData = encodeFunctionData({
            abi: executorAbi,
            functionName: "exec_606BaXt",
            args: [calls],
          });

          const [gasEstimate, gasPrice] = await Promise.all([
            estimateGas(this.client, {
              account: this.client.account.address,
              to: encoder.address,
              data: execData,
            }),
            getGasPrice(this.client),
          ]);

          profitable = await this.checkProfit(
            marketParams.loanToken,
            { beforeTx: undefined, afterTx: undefined },
            { used: gasEstimate, price: gasPrice },
            badDebtPosition,
          );
        } else {
          throw error;
        }
      }
    }

    if (!profitable) return false;

    // TX EXECUTION

    if (this.flashbotAccount) {
      const signedBundle = await Flashbots.signBundle([
        {
          transaction: { to: encoder.address, ...functionData },
          client: this.client,
        },
      ]);

      await Flashbots.sendRawBundle(
        signedBundle,
        (await getBlockNumber(this.client)) + 1n,
        this.flashbotAccount,
      );
      return true;
    } else {
      return await writeContract(this.client, { address: encoder.address, ...functionData });
    }
  }

  private async convertCollateralToLoan(
    marketParams: IMarketParams,
    seizableCollateral: bigint,
    encoder: LiquidationEncoder,
  ) {
    let toConvert = {
      src: getAddress(marketParams.collateralToken),
      dst: getAddress(marketParams.loanToken),
      srcAmount: seizableCollateral,
    };

    for (const venue of this.liquidityVenues) {
      try {
        if (await venue.supportsRoute(encoder, toConvert.src, toConvert.dst))
          toConvert = await venue.convert(encoder, toConvert);
      } catch (error) {
        console.error(`${this.logTag}Error converting ${toConvert.src} to ${toConvert.dst}`, error);
        continue;
      }

      if (toConvert.src === toConvert.dst) return true;
    }

    return false;
  }

  private async price(asset: Address, amount: bigint, pricers: Pricer[]) {
    try {
      const result = await Promise.any(
        pricers.map(async (pricer) => {
          const r = await pricer.price(this.client, asset);
          if (r === undefined) throw new Error("no price");
          return r;
        }),
      );

      const decimals =
        result.decimals ??
        (asset === this.wNative
          ? 18
          : (this.decimalsCache[asset] ??= await readContract(this.client, {
              address: asset,
              abi: erc20Abi,
              functionName: "decimals",
            })));

      return parseFloat(formatUnits(amount, decimals)) * result.usdPrice;
    } catch {
      return undefined;
    }
  }

  private async checkProfit(
    loanAsset: Address,
    loanAssetBalance: {
      beforeTx: bigint | undefined;
      afterTx: bigint | undefined;
    },
    gas: {
      used: bigint;
      price: bigint;
    },
    badDebtPosition: boolean,
  ) {
    if (this.alwaysRealizeBadDebt && badDebtPosition) return true;
    if (this.pricers === undefined || this.pricers.length === 0) return true;

    if (loanAssetBalance.beforeTx === undefined || loanAssetBalance.afterTx === undefined)
      return false;

    const loanAssetProfit = loanAssetBalance.afterTx - loanAssetBalance.beforeTx;

    if (loanAssetProfit <= 0n) return false;

    const [loanAssetProfitUsd, gasUsedUsd] = await Promise.all([
      this.price(loanAsset, loanAssetProfit, this.pricers),
      this.price(this.wNative, gas.used * gas.price, this.pricers),
    ]);

    if (loanAssetProfitUsd === undefined || gasUsedUsd === undefined) return false;

    const profitUsd = loanAssetProfitUsd - gasUsedUsd;

    return profitUsd > 0;
  }

  private decreaseSeizableCollateral(seizableCollateral: bigint, badDebtPosition: boolean) {
    if (badDebtPosition) return seizableCollateral;

    const liquidationBufferBps =
      chainConfigs[this.chainId]?.options.liquidationBufferBps ?? DEFAULT_LIQUIDATION_BUFFER_BPS;

    return wMulDown(seizableCollateral, WAD - parseUnits(liquidationBufferBps.toString(), 14));
  }

  private checkCooldown(marketId: Hex, account: Address) {
    if (
      this.positionLiquidationCooldownMechanism !== undefined &&
      !this.positionLiquidationCooldownMechanism.isPositionReady(marketId, account)
    ) {
      return false;
    }
    return true;
  }

  private async fetchMarkets() {
    if (!this.marketsFetchingCooldownMechanism.isFetchingReady()) return;

    if (this.vaultWhitelist === "morpho-api")
      this.vaultWhitelist = await fetchWhitelistedVaults(this.chainId);

    const vaultWhitelist = this.vaultWhitelist === "all" ? [] : this.vaultWhitelist;
    console.log(
      `${this.logTag}📝 Watching markets in ${this.vaultWhitelist === "all" ? "all" : vaultWhitelist.length} vaults`,
    );

    const whitelistedMarketsFromVaults = await this.dataProvider.fetchMarkets(
      this.client,
      vaultWhitelist,
    );

    this.coveredMarkets = [...whitelistedMarketsFromVaults, ...this.additionalMarketsWhitelist];
    console.log(`${this.logTag}Covering ${this.coveredMarkets.length} markets`);
  }
}
