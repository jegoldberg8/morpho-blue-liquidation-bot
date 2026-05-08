import { ExecutorEncoder } from "executooor-viem";
import { Address, Hex } from "viem";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

const BASE_URL = "https://api.0x.org/swap/allowance-holder/quote";
const API_KEY = process.env.ZEROX_API_KEY ?? "";

interface ZeroExResponse {
  buyAmount: string;
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: string;
  };
  liquidityAvailable: boolean;
}

export class ZeroExVenue implements LiquidityVenue {
  supportsRoute(_encoder: ExecutorEncoder, src: Address, dst: Address) {
    return src !== dst && !!API_KEY;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    try {
      if (srcAmount <= 0n) return toConvert;

      const chainId = encoder.client.chain.id;
      const params = new URLSearchParams({
        chainId: chainId.toString(),
        sellToken: src,
        buyToken: dst,
        sellAmount: srcAmount.toString(),
        taker: encoder.address,
        slippageBps: "300",
      });

      const response = await fetch(`${BASE_URL}?${params}`, {
        headers: {
          "0x-api-key": API_KEY,
          "0x-version": "v2",
        },
      });

      if (!response.ok) return toConvert;

      const data = (await response.json()) as ZeroExResponse;

      if (
        !data.liquidityAvailable ||
        !data.transaction?.data ||
        !data.transaction?.to ||
        !data.buyAmount
      ) {
        return toConvert;
      }

      encoder.erc20Approve(src, data.transaction.to as Address, srcAmount);
      encoder.pushCall(
        data.transaction.to as Address,
        BigInt(data.transaction.value || "0"),
        data.transaction.data as Hex,
      );

      return {
        src: dst,
        dst,
        srcAmount: BigInt(data.buyAmount),
      };
    } catch {
      return toConvert;
    }
  }
}
