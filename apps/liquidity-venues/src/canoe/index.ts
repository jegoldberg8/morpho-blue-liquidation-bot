import { CANOE_BASE_URL, CANOE_CHAIN_NAMES } from "@morpho-blue-liquidation-bot/config";
import { ExecutorEncoder } from "executooor-viem";
import { Account, Address, Chain, Client, erc20Abi, Hex, Transport } from "viem";
import { readContract } from "viem/actions";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

import { CanoeSwapQuoteResponse } from "./types";

interface MarketOverviewStatus {
  name: string;
  active: boolean;
  report?: { chains: string[] };
}

export class CanoeVenue implements LiquidityVenue {
  private marketsByChain: Record<string, string[]> = {};
  private initPromise: Promise<void> | null = null;

  private init() {
    if (!this.initPromise) {
      this.initPromise = this.fetchMarketOverview();
    }
    return this.initPromise;
  }

  private async fetchMarketOverview() {
    try {
      const response = await fetch(`${CANOE_BASE_URL}/market/overview`);
      if (!response.ok) throw new Error(`overview: ${response.status}`);

      const data = (await response.json()) as { status: MarketOverviewStatus[] };

      for (const market of data.status) {
        if (!market.active || !market.report?.chains) continue;
        for (const chain of market.report.chains) {
          this.marketsByChain[chain] ??= [];
          this.marketsByChain[chain].push(market.name);
        }
      }

      console.log(
        `Canoe: loaded ${data.status.filter((m) => m.active).length} markets for ${Object.keys(this.marketsByChain).length} chains`,
      );
    } catch (error) {
      console.error("Canoe: failed to fetch market overview", error);
      this.initPromise = null; // allow retry on failure
    }
  }

  supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    if (src === dst) return false;
    return encoder.client.chain.id in CANOE_CHAIN_NAMES;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    try {
      await this.init();

      const chainId = encoder.client.chain.id;
      const chainName = CANOE_CHAIN_NAMES[chainId];
      if (!chainName) return toConvert;

      const markets = this.marketsByChain[chainName];
      if (!markets || markets.length === 0) return toConvert;

      const srcDecimals = await this.getAssetsDecimals(encoder.client, src);
      const inTokenAmount = (Number(srcAmount) / 10 ** srcDecimals).toString();

      if (Number(inTokenAmount) <= 0) return toConvert;

      const quote = await this.fetchBestQuote(
        chainName,
        markets,
        src,
        dst,
        inTokenAmount,
        encoder.address,
      );
      if (!quote) return toConvert;

      // Approve the trade target
      const tradeTo = quote.executionInfo!.trade.to as Address;
      encoder.erc20Approve(src, tradeTo, srcAmount);

      // Execute the swap
      const value = BigInt(quote.executionInfo!.trade.value || "0");
      encoder.pushCall(tradeTo, value, quote.executionInfo!.trade.data as Hex);

      return {
        src: dst,
        dst,
        srcAmount: BigInt(quote.outAmountRaw),
      };
    } catch (error) {
      console.error("Canoe: failed to fetch swap route", error);
      return toConvert;
    }
  }

  private async fetchBestQuote(
    chainName: string,
    markets: string[],
    src: Address,
    dst: Address,
    inTokenAmount: string,
    account: Address,
  ): Promise<CanoeSwapQuoteResponse | null> {
    const body = JSON.stringify({
      chain: chainName,
      account,
      dstAddress: account,
      isExactIn: true,
      inTokenAddress: src,
      outTokenAddress: dst,
      inTokenAmount,
      slippage: 50,
    });

    try {
      return await Promise.any(
        markets.map(async (market) => {
          const response = await fetch(`${CANOE_BASE_URL}/market/${market}/swap_quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });

          if (!response.ok) throw new Error(`${market}: ${response.status}`);

          const data = (await response.json()) as CanoeSwapQuoteResponse;

          if (!data.executionInfo?.trade?.data || !data.executionInfo.trade.to) {
            throw new Error(`${market}: no execution info`);
          }

          if (data.simulation?.error) {
            throw new Error(`${market}: simulation failed`);
          }

          if (
            data.netValue !== undefined &&
            data.tokenInUsdValue !== undefined &&
            data.netValue < data.tokenInUsdValue
          ) {
            throw new Error(
              `${market}: not profitable (net $${data.netValue.toFixed(2)} < in $${data.tokenInUsdValue.toFixed(2)})`,
            );
          }

          return data;
        }),
      );
    } catch {
      return null;
    }
  }

  private decimalPromises: Record<string, Promise<number>> = {};

  private getAssetsDecimals(client: Client<Transport, Chain, Account>, asset: Address) {
    const key = `${client.chain.id}-${asset}`;
    if (!this.decimalPromises[key]) {
      this.decimalPromises[key] = readContract(client, {
        address: asset,
        abi: erc20Abi,
        functionName: "decimals",
      });
    }
    return this.decimalPromises[key];
  }
}
