import type { Account, Address, Chain, Client, Transport } from "viem";

import type { PriceResult, Pricer } from "../pricer";

type CoinKey = `${string}:0x${string}`;

const CHAIN_SLUGS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  130: "unichain",
  143: "monad",
  999: "hyperliquid",
  1329: "sei",
  8453: "base",
  42161: "arbitrum",
};

interface CachedPrice {
  price: number;
  fetchTimestamp: number;
  apiTimestamp: number;
}

interface DefiLlamaPriceResponse {
  coins: Record<
    CoinKey,
    {
      decimals: number;
      price: number;
      symbol: string;
      timestamp: number;
    }
  >;
}

export class DefiLlamaPricer implements Pricer {
  private priceCache = new Map<CoinKey, CachedPrice>();
  private readonly cacheTimeoutMs: number = 10_000; // 10 seconds

  async price(
    client: Client<Transport, Chain, Account>,
    asset: Address,
  ): Promise<PriceResult | undefined> {
    const slug = CHAIN_SLUGS[client.chain.id];
    if (!slug) return undefined;

    const cacheKey: CoinKey = `${slug}:${asset}`;
    const cachedResult = this.priceCache.get(cacheKey);

    if (cachedResult && Date.now() - cachedResult.fetchTimestamp < this.cacheTimeoutMs) {
      return { usdPrice: cachedResult.price };
    }

    const price = await this.fetchPrice(slug, asset);
    if (price === undefined) return undefined;
    return { usdPrice: price };
  }

  private async fetchPrice(slug: string, asset: Address): Promise<number | undefined> {
    const coinKey: CoinKey = `${slug}:${asset}`;
    const url = `https://coins.llama.fi/prices/current/${coinKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;

      const data = (await response.json()) as DefiLlamaPriceResponse;
      const coinData = data.coins[coinKey];
      if (!coinData) return undefined;

      this.priceCache.set(coinKey, {
        price: coinData.price,
        fetchTimestamp: Date.now(),
        apiTimestamp: coinData.timestamp,
      });

      return coinData.price;
    } catch {
      return undefined;
    }
  }
}
