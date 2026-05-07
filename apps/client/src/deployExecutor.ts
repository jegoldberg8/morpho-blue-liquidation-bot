import { chainConfigs } from "@morpho-blue-liquidation-bot/config";
import dotenv from "dotenv";
import { createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { deploy } from "./utils/deploy-executor.js";

async function run() {
  dotenv.config();

  const chainIdArg = process.argv.find((arg) => arg.startsWith("--chain="))?.split("=")[1];

  const configs = Object.values(chainConfigs).filter(
    (c) => !chainIdArg || c.chain.id === Number(chainIdArg),
  );

  if (configs.length === 0) {
    console.error(`No chain found for --chain=${chainIdArg}`);
    process.exit(1);
  }

  for (const config of configs) {
    const chain = config.chain;
    const id = chain.id;

    const rpcUrl =
      process.env[`WRITE_RPC_URL_${id}`] ??
      process.env[`RPC_URL_${id}`] ??
      chain.rpcUrls.default.http[0];
    const privateKey = process.env[`LIQUIDATION_PRIVATE_KEY_${id}`];

    if (!rpcUrl) {
      throw new Error(`RPC_URL_${id} is not set`);
    }
    if (!privateKey) {
      console.log(`Skipping ${chain.name} (chain ${id}): LIQUIDATION_PRIVATE_KEY_${id} is not set`);
      continue;
    }

    const client = createWalletClient({
      chain,
      transport: http(rpcUrl),
      account: privateKeyToAccount(privateKey as Hex),
    });

    await deploy(client, privateKeyToAccount(privateKey as Hex).address);
  }
}

void run();
