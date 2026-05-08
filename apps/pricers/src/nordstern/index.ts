import type { Account, Address, Chain, Client, Transport } from "viem";

import type { PriceResult, Pricer } from "../pricer";

const BASE_URL = "https://api.nordstern.finance";

export class NordsternPricer implements Pricer {
  async price(
    client: Client<Transport, Chain, Account>,
    asset: Address,
  ): Promise<PriceResult | undefined> {
    try {
      const chainId = client.chain.id;
      const response = await fetch(`${BASE_URL}/prices/${chainId}?token=${asset}`);

      if (!response.ok) return undefined;

      const data = (await response.json()) as Record<string, number>;
      const usdPrice = data[asset] ?? data[asset.toLowerCase()];

      if (usdPrice === undefined || usdPrice <= 0) return undefined;

      return { usdPrice };
    } catch {
      return undefined;
    }
  }
}
