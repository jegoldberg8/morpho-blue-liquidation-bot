import type { Account, Address, Chain, Client, Transport } from "viem";

import type { PriceResult, Pricer } from "../pricer";

const LIFI_TOKEN_URL = "https://li.quest/v1/token";
const CACHE_TTL_MS = 10_000; // 10 seconds

interface CachedPrice {
  usdPrice: number;
  fetchedAt: number;
}

export class LiFiPricer implements Pricer {
  private cache: Record<string, CachedPrice> = {};

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

    try {
      const res = await fetch(`${LIFI_TOKEN_URL}?chain=${chainId}&token=${asset}`);
      if (!res.ok) return undefined;

      const data = (await res.json()) as { priceUSD?: string };
      const usdPrice = parseFloat(data.priceUSD ?? "0");
      if (usdPrice <= 0) return undefined;

      this.cache[key] = { usdPrice, fetchedAt: Date.now() };
      return { usdPrice };
    } catch {
      return undefined;
    }
  }
}
