import {
  DEX_AGGREGATOR_URL,
  DEX_AGGREGATOR_CHAIN_NAMES,
} from "@morpho-blue-liquidation-bot/config";
import type { Account, Address, Chain, Client, Transport } from "viem";

import type { PriceResult, Pricer } from "../pricer";

interface DexAggregatorOracleResponse {
  usdPrice: number;
  token_decimals: number;
}

export class DexAggregatorPricer implements Pricer {
  async price(
    client: Client<Transport, Chain, Account>,
    asset: Address,
  ): Promise<PriceResult | undefined> {
    const chainName = DEX_AGGREGATOR_CHAIN_NAMES[client.chain.id];
    if (!chainName) return undefined;

    try {
      const response = await fetch(`${DEX_AGGREGATOR_URL}/oracle/safe_usd_price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: chainName, address: asset }),
      });

      if (!response.ok) return undefined;

      const data = (await response.json()) as DexAggregatorOracleResponse;

      if (data.usdPrice <= 0) return undefined;

      return { usdPrice: data.usdPrice, decimals: data.token_decimals };
    } catch {
      return undefined;
    }
  }
}
