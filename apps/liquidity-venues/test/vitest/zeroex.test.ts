import type { AnvilTestClient } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { ExecutorEncoder, executorAbi, bytecode } from "executooor-viem";
import { erc20Abi, parseUnits } from "viem";
import { readContract } from "viem/actions";
import { worldchain } from "viem/chains";
import { describe, expect, it } from "vitest";

import { ZeroExVenue } from "../../src/zeroex/index.js";

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

describe("0x liquidity venue", () => {
  const venue = new ZeroExVenue();

  it("should require API key", () => {
    if (!process.env.ZEROX_API_KEY) {
      console.log("Skipping 0x tests — ZEROX_API_KEY not set");
      return;
    }
  });

  worldchainTest("should get a quote and encode calldata", async ({ encoder }) => {
    if (!process.env.ZEROX_API_KEY) return;

    const amount = parseUnits("0.01", 18);

    const result = await venue.convert(encoder, {
      src: WETH,
      dst: USDC,
      srcAmount: amount,
    });

    expect(result.src).toBe(USDC);
    expect(result.dst).toBe(USDC);
    expect(result.srcAmount).toBeGreaterThan(0n);

    const calls = encoder.flush();
    expect(calls.length).toBeGreaterThan(0);
  });

  worldchainTest("should execute swap on fork", async ({ encoder }) => {
    if (!process.env.ZEROX_API_KEY) return;

    const amount = parseUnits("0.01", 18);

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
    console.log(`0x: Swapped 0.01 WETH -> ${usdcBalance} USDC (raw)`);
  });
});
