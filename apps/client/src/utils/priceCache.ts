import type { Address } from "viem";

const BASE_URL = "https://api.nordstern.finance";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Global price cache that fetches all token prices per chain from Nordstern
 * and refreshes every 5 minutes. Used for dust filtering only — not for
 * profitability calculations.
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

    // Initial fetch — await so prices are ready before bot starts
    await this.refreshAll();

    // Periodic refresh
    setInterval(() => {
      void this.refreshAll();
    }, REFRESH_INTERVAL_MS);
  }

  private async refreshAll() {
    for (const [chainIdStr, tokenSet] of Object.entries(this.tokens)) {
      const chainId = Number(chainIdStr);
      const tokens = [...tokenSet];
      if (tokens.length === 0) continue;

      try {
        const tokenList = tokens.join(",");
        const response = await fetch(`${BASE_URL}/prices/${chainId}?token=${tokenList}`);
        if (!response.ok) {
          console.log(`[PriceCache] chain=${chainId} HTTP ${response.status}`);
          continue;
        }

        const data = (await response.json()) as Record<string, number>;
        let count = 0;

        for (const [addr, price] of Object.entries(data)) {
          if (price > 0) {
            this.prices[`${chainId}-${addr.toLowerCase()}`] = price;
            count++;
          }
        }

        console.log(`[PriceCache] chain=${chainId}: ${count} token prices cached`);
      } catch (error) {
        console.error(`[PriceCache] chain=${chainId} fetch failed`, error);
      }
    }
  }
}

export const priceCache = new PriceCache();
