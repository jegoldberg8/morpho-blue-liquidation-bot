import type { Account, Address, Chain, Client, Transport } from "viem";

import type { PriceResult, Pricer } from "../pricer";

const BASE_URL = "https://api.nordstern.finance";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedPrice {
  usdPrice: number;
  fetchedAt: number;
}

export class NordsternPricer implements Pricer {
  private cache: Record<string, CachedPrice> = {};

  async prefetchPrices(chainId: number, tokens: Address[]): Promise<void> {
    const uncached = tokens.filter((t) => {
      const key = `${chainId}-${t.toLowerCase()}`;
      const cached = this.cache[key];
      return !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS;
    });

    if (uncached.length === 0) return;

    try {
      const tokenList = [...new Set(uncached)].join(",");
      const response = await fetch(`${BASE_URL}/prices/${chainId}?token=${tokenList}`);
      if (!response.ok) return;

      const data = (await response.json()) as Record<string, number>;
      const now = Date.now();

      for (const [addr, usdPrice] of Object.entries(data)) {
        if (usdPrice > 0) {
          this.cache[`${chainId}-${addr.toLowerCase()}`] = { usdPrice, fetchedAt: now };
        }
      }
    } catch {
      // silent fail
    }
  }

  async price(
    client: Client<Transport, Chain, Account>,
    asset: Address,
  ): Promise<PriceResult | undefined> {
    const chainId = client.chain.id;
    const key = `${chainId}-${asset.toLowerCase()}`;
    const cached = this.cache[key];

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { usdPrice: cached.usdPrice };
    }

    // Cache miss — fetch single token
    try {
      const response = await fetch(`${BASE_URL}/prices/${chainId}?token=${asset}`);
      if (!response.ok) return undefined;

      const data = (await response.json()) as Record<string, number>;
      const usdPrice = data[asset] ?? data[asset.toLowerCase()];

      if (usdPrice === undefined || usdPrice <= 0) return undefined;

      this.cache[key] = { usdPrice, fetchedAt: Date.now() };
      return { usdPrice };
    } catch {
      return undefined;
    }
  }
}
