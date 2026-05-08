import { ExecutorEncoder } from "executooor-viem";
import { Address, Hex } from "viem";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

const BASE_URL = "https://api.enso.finance/api/v1/shortcuts/route";
const API_KEY = process.env.ENSO_API_KEY ?? "";

interface EnsoResponse {
  amountOut: string;
  tx: {
    to: string;
    data: string;
    value: string;
  };
}

export class EnsoVenue implements LiquidityVenue {
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
        fromAddress: encoder.address,
        tokenIn: src,
        tokenOut: dst,
        amountIn: srcAmount.toString(),
        routingStrategy: "router",
        slippage: "300",
      });

      const response = await fetch(`${BASE_URL}?${params}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      if (!response.ok) return toConvert;

      const data = (await response.json()) as EnsoResponse;

      if (!data.tx?.data || !data.tx?.to || !data.amountOut) return toConvert;

      encoder.erc20Approve(src, data.tx.to as Address, srcAmount);
      encoder.pushCall(data.tx.to as Address, BigInt(data.tx.value || "0"), data.tx.data as Hex);

      return {
        src: dst,
        dst,
        srcAmount: BigInt(data.amountOut),
      };
    } catch {
      return toConvert;
    }
  }
}
