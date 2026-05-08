import {
  DEX_AGGREGATOR_URL,
  DEX_AGGREGATOR_CHAIN_NAMES,
} from "@morpho-blue-liquidation-bot/config";
import { ExecutorEncoder } from "executooor-viem";
import { Account, Address, Chain, Client, erc20Abi, Hex, Transport } from "viem";
import { readContract } from "viem/actions";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

import { DexAggregatorQuoteResponse } from "./types";

const MARKETS_BY_CHAIN: Record<string, string[]> = {
  hyperevm: ["enso", "icecreamswap", "kyberswap", "openocean", "usor", "zeroex"],
  worldchain: ["enso", "icecreamswap", "usor", "zeroex"],
  etherlink: ["kyberswap", "threeroute", "usor"],
  monad: ["enso", "icecreamswap", "kyberswap", "okx", "openocean", "usor", "zeroex"],
  unichain: [
    "enso",
    "icecreamswap",
    "kyberswap",
    "odos",
    "okx",
    "oneinch",
    "openocean",
    "paraswap",
    "usor",
    "zeroex",
  ],
  optimism: [
    "enso",
    "icecreamswap",
    "kyberswap",
    "odos",
    "okx",
    "oneinch",
    "openocean",
    "paraswap",
    "usor",
    "zeroex",
  ],
};

export class DexAggregatorVenue implements LiquidityVenue {
  supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    if (src === dst) return false;
    return encoder.client.chain.id in DEX_AGGREGATOR_CHAIN_NAMES;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    try {
      const chainId = encoder.client.chain.id;
      const chainName = DEX_AGGREGATOR_CHAIN_NAMES[chainId];
      if (!chainName) return toConvert;

      const markets = MARKETS_BY_CHAIN[chainName];
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
      console.error("DexAggregator: failed to fetch swap route", error);
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
  ): Promise<DexAggregatorQuoteResponse | null> {
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
          const response = await fetch(`${DEX_AGGREGATOR_URL}/market/${market}/swap_quote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });

          if (!response.ok) throw new Error(`${market}: ${response.status}`);

          const data = (await response.json()) as DexAggregatorQuoteResponse;

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
