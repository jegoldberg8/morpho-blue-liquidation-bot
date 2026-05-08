import {
  chainConfigs,
  chainConfig,
  type DataProviderName,
} from "@morpho-blue-liquidation-bot/config";
import {
  createDataProviders,
  type DataProvider,
} from "@morpho-blue-liquidation-bot/data-providers";
import { createPublicClient, erc20Abi, http, type Address } from "viem";

import { startHealthServer } from "./health";
import { priceCache } from "./utils/priceCache";

import { launchBot } from ".";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

async function run() {
  // --provider=morphoApi or --provider=hyperIndex overrides config
  const providerArg = process.argv.find((arg) => arg.startsWith("--provider="))?.split("=")[1] as
    | DataProviderName
    | undefined;

  // --chain=480 or --chain=999,480 to run specific chains
  const chainArg = process.argv.find((arg) => arg.startsWith("--chain="))?.split("=")[1];
  const chainFilter = chainArg ? chainArg.split(",").map(Number) : null;

  if (providerArg) {
    console.log(`Using data provider override: ${providerArg}`);
  }
  if (chainFilter) {
    console.log(`Running on chains: ${chainFilter.join(", ")}`);
  }

  const configs = Object.keys(chainConfigs)
    .map(Number)
    .filter((id) => !chainFilter || chainFilter.includes(id))
    .map((id) => {
      try {
        return chainConfig(id);
      } catch {
        return undefined;
      }
    })
    .filter((config) => config !== undefined);

  // Group chains by data provider name
  const chainsByProvider = new Map<DataProviderName, number[]>();
  for (const config of configs) {
    const provider = providerArg ?? config.dataProvider;
    const existing = chainsByProvider.get(provider) ?? [];
    existing.push(config.chainId);
    chainsByProvider.set(provider, existing);
  }

  // Create data providers (one per provider type, shared across chains)
  const providersByChain = new Map<number, DataProvider>();
  for (const [providerName, chainIds] of chainsByProvider) {
    const providers = await createDataProviders(providerName, chainIds);
    for (const [chainId, provider] of providers) {
      providersByChain.set(chainId, provider);
    }
  }

  // Register tokens for price caching — fetch all unique tokens from indexer
  for (const config of configs) {
    priceCache.registerToken(config.chainId, config.wNative);

    const dataProvider = providersByChain.get(config.chainId);
    if (dataProvider && "graphqlClient" in dataProvider) {
      try {
        const gqlClient = (dataProvider as any).graphqlClient;
        const data = await gqlClient.request(
          `{ Market(where: { chainId: { _eq: ${config.chainId} } }) { loanToken collateralToken } }`,
        );
        const tokens = new Set<string>();
        for (const m of data.Market ?? []) {
          priceCache.registerToken(config.chainId, m.collateralToken);
          priceCache.registerToken(config.chainId, m.loanToken);
          tokens.add(m.collateralToken);
          tokens.add(m.loanToken);
        }

        // Fetch decimals for all tokens (one RPC call each, done once)
        const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
        for (const token of tokens) {
          try {
            const dec = await client.readContract({
              address: token as Address,
              abi: erc20Abi,
              functionName: "decimals",
            });
            priceCache.setDecimals(config.chainId, token as Address, dec);
          } catch {
            // default to 18
          }
        }
        console.log(`[PriceCache] chain=${config.chainId}: registered ${tokens.size} tokens`);
      } catch {
        // Fallback for non-indexer chains
      }
    }
  }
  await priceCache.start();

  try {
    await startHealthServer();
  } catch (err) {
    console.error("Failed to start health server:", err);
  }

  for (const config of configs) {
    const dataProvider = providersByChain.get(config.chainId);
    if (!dataProvider) {
      console.error(`No data provider for chain ${config.chainId}, skipping`);
      continue;
    }
    try {
      launchBot(config, dataProvider);
    } catch (err) {
      console.error(`Failed to launch bot for chain ${config.chainId}:`, err);
    }
  }
}

void run();
