import type { Address } from "viem";

const NORDSTERN_URL = "https://api.nordstern.finance";
const DEFILLAMA_URL = "https://coins.llama.fi/prices/current";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const DEFILLAMA_SLUGS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  130: "unichain",
  143: "monad",
  480: "wc",
  999: "hyperliquid",
  1329: "sei",
  8453: "base",
  42161: "arbitrum",
};

/**
 * Global price cache that races Nordstern and DeFiLlama for token prices.
 * Refreshes every 5 minutes. Used for dust filtering only.
 */
class PriceCache {
  private prices: Record<string, number> = {}; // key: `${chainId}-${address}` -> usdPrice
  private decimals: Record<string, number> = {}; // key: `${chainId}-${address}` -> decimals
  private tokens: Record<number, Set<string>> = {}; // chainId -> set of token addresses
  private started = false;

  registerToken(chainId: number, token: Address) {
    this.tokens[chainId] ??= new Set();
    this.tokens[chainId].add(token.toLowerCase());
  }

  registerTokens(chainId: number, tokens: Address[]) {
    for (const token of tokens) {
      this.registerToken(chainId, token);
    }
  }

  getPrice(chainId: number, token: Address): number | undefined {
    return this.prices[`${chainId}-${token.toLowerCase()}`];
  }

  setDecimals(chainId: number, token: Address, dec: number) {
    this.decimals[`${chainId}-${token.toLowerCase()}`] = dec;
  }

  getDecimals(chainId: number, token: Address): number {
    return this.decimals[`${chainId}-${token.toLowerCase()}`] ?? 18;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    await this.refreshAll();

    setInterval(() => {
      void this.refreshAll();
    }, REFRESH_INTERVAL_MS);
  }

  private async fetchNordstern(
    chainId: number,
    tokens: string[],
    retries = 3,
  ): Promise<Record<string, number>> {
    const tokenList = tokens.join(",");
    for (let attempt = 0; attempt < retries; attempt++) {
      const response = await fetch(`${NORDSTERN_URL}/prices/${chainId}?token=${tokenList}`);
      if (response.status === 429) {
        const delay = (attempt + 1) * 5000;
        console.log(
          `[PriceCache] nordstern chain=${chainId} rate limited, retrying in ${delay / 1000}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!response.ok) throw new Error(`nordstern ${response.status}`);
      const data = (await response.json()) as Record<string, number>;
      const result: Record<string, number> = {};
      for (const [addr, price] of Object.entries(data)) {
        if (price > 0) result[addr.toLowerCase()] = price;
      }
      if (Object.keys(result).length === 0) throw new Error("nordstern no prices");
      return result;
    }
    throw new Error("nordstern 429 after retries");
  }

  private async fetchDeFiLlama(chainId: number, tokens: string[]): Promise<Record<string, number>> {
    const slug = DEFILLAMA_SLUGS[chainId];
    if (!slug) throw new Error("no defillama slug");
    const coins = tokens.map((t) => `${slug}:${t}`).join(",");
    const response = await fetch(`${DEFILLAMA_URL}/${coins}`);
    if (!response.ok) throw new Error(`defillama ${response.status}`);
    const data = (await response.json()) as {
      coins: Record<string, { price: number }>;
    };
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.coins)) {
      if (val.price > 0) {
        const addr = key.split(":")[1] ?? key;
        result[addr.toLowerCase()] = val.price;
      }
    }
    if (Object.keys(result).length === 0) throw new Error("defillama no prices");
    return result;
  }

  private async fetchChainPrices(chainId: number, tokens: string[]): Promise<void> {
    const merged: Record<string, number> = {};

    // Batch fetch from both sources
    const results = await Promise.allSettled([
      this.fetchNordstern(chainId, tokens),
      this.fetchDeFiLlama(chainId, tokens),
    ]);

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const [addr, price] of Object.entries(result.value)) {
          merged[addr] ??= price;
        }
      }
    }

    // Individually fetch any tokens that batch missed
    const missing = tokens.filter((t) => !(t in merged));
    if (missing.length > 0) {
      console.log(
        `[PriceCache] chain=${chainId}: ${missing.length} unpriced: ${missing.join(", ")}`,
      );
    }
    if (missing.length > 0) {
      await Promise.allSettled(
        missing.map(async (token) => {
          try {
            const res = await fetch(`${NORDSTERN_URL}/prices/${chainId}?token=${token}`);
            if (!res.ok) return;
            const data = (await res.json()) as Record<string, number>;
            for (const [addr, price] of Object.entries(data)) {
              if (price > 0) merged[addr.toLowerCase()] = price;
            }
          } catch {
            // skip
          }
        }),
      );
    }

    if (Object.keys(merged).length === 0) {
      const reasons = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason as Error).message)
        .join(", ");
      console.log(`[PriceCache] chain=${chainId}: all sources failed: ${reasons}`);
      return;
    }

    for (const [addr, price] of Object.entries(merged)) {
      this.prices[`${chainId}-${addr}`] = price;
    }
    console.log(
      `[PriceCache] chain=${chainId}: ${Object.keys(merged).length}/${tokens.length} token prices cached`,
    );
  }

  private async refreshAll() {
    for (const [chainIdStr, tokenSet] of Object.entries(this.tokens)) {
      const chainId = Number(chainIdStr);
      const tokens = [...tokenSet];
      if (tokens.length === 0) continue;

      await this.fetchChainPrices(chainId, tokens);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export const priceCache = new PriceCache();
