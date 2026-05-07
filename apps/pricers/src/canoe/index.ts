import { CANOE_BASE_URL, CANOE_CHAIN_NAMES } from "@morpho-blue-liquidation-bot/config";
import type { Account, Address, Chain, Client, Transport } from "viem";

import type { PriceResult, Pricer } from "../pricer";

interface CanoeOracleResponse {
  usdPrice: number;
  token_decimals: number;
}

export class CanoePricer implements Pricer {
  async price(
    client: Client<Transport, Chain, Account>,
    asset: Address,
  ): Promise<PriceResult | undefined> {
    const chainName = CANOE_CHAIN_NAMES[client.chain.id];
    if (!chainName) return undefined;

    try {
      const response = await fetch(`${CANOE_BASE_URL}/oracle/safe_usd_price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: chainName, address: asset }),
      });

      if (!response.ok) return undefined;

      const data = (await response.json()) as CanoeOracleResponse;

      if (data.usdPrice <= 0) return undefined;

      return { usdPrice: data.usdPrice, decimals: data.token_decimals };
    } catch {
      return undefined;
    }
  }
}
