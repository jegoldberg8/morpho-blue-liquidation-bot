import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { ExecutorEncoder, executorAbi, bytecode } from "executooor-viem";
import { erc20Abi, parseUnits } from "viem";
import { readContract } from "viem/actions";
import { worldchain } from "viem/chains";
import { describe, expect } from "vitest";

import { NordsternVenue } from "../../src/nordstern/index.js";

// Worldchain tokens
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";

const worldchainTest = createViemTest(worldchain, {
  forkUrl: process.env.RPC_URL_480 ?? "https://worldchain-mainnet.g.alchemy.com/public",
  forkBlockNumber: 29_440_000,
  timeout: 45_000,
}).extend<{ encoder: ExecutorEncoder<AnvilTestClient<typeof worldchain>> }>({
  encoder: async ({ client }, use) => {
    const receipt = await client.deployContractWait({
      abi: executorAbi,
      bytecode,
      args: [client.account.address],
    });
    await use(new ExecutorEncoder(receipt.contractAddress, client));
  },
});

describe("nordstern liquidity venue", () => {
  const venue = new NordsternVenue();

  worldchainTest("should support route for different tokens", async ({ encoder }) => {
    expect(venue.supportsRoute(encoder, WETH, USDC)).toBe(true);
    expect(venue.supportsRoute(encoder, WETH, WETH)).toBe(false);
  });

  worldchainTest("should get a quote and encode calldata", async ({ encoder }) => {
    const amount = parseUnits("0.01", 18); // 0.01 WETH

    const result = await venue.convert(encoder, {
      src: WETH,
      dst: USDC,
      srcAmount: amount,
    });

    // Should have converted
    expect(result.src).toBe(USDC);
    expect(result.dst).toBe(USDC);
    expect(result.srcAmount).toBeGreaterThan(0n);

    // Should have encoded calls
    const calls = encoder.flush();
    expect(calls.length).toBeGreaterThan(0);
  });

  worldchainTest("should execute swap on fork", async ({ encoder }) => {
    const amount = parseUnits("0.01", 18);

    // Deal WETH to executor
    await encoder.client.deal({
      erc20: WETH,
      account: encoder.address,
      amount,
    });

    await venue.convert(encoder, {
      src: WETH,
      dst: USDC,
      srcAmount: amount,
    });

    await encoder.exec();

    const usdcBalance = await readContract(encoder.client, {
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [encoder.address],
    });

    expect(usdcBalance).toBeGreaterThan(0n);
    console.log(`Swapped 0.01 WETH -> ${usdcBalance} USDC (raw)`);
  });
});
