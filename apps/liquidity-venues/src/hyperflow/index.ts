import { ExecutorEncoder } from "executooor-viem";
import { Address, Hex } from "viem";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

const BASE_URL = "https://ag-api.hyperflow.fun/v1/hyperevm/swap";

interface HyperFlowResponse {
  quote: {
    amountOut: string;
    minAmountOut: string;
  };
  tx: {
    router: string;
    data: string;
  };
}

export class HyperFlowVenue implements LiquidityVenue {
  supportsRoute(encoder: ExecutorEncoder, src: Address, dst: Address) {
    return src !== dst && encoder.client.chain.id === 999;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    try {
      if (srcAmount <= 0n) return toConvert;

      const params = new URLSearchParams({
        tokenIn: src,
        tokenOut: dst,
        amountIn: srcAmount.toString(),
        receiver: encoder.address,
        slippage: "0.01",
      });

      const response = await fetch(`${BASE_URL}?${params}`);
      if (!response.ok) return toConvert;

      const data = (await response.json()) as HyperFlowResponse;
      if (!data.tx?.data || !data.tx?.router || !data.quote?.amountOut) return toConvert;

      encoder.erc20Approve(src, data.tx.router as Address, srcAmount);
      encoder.pushCall(data.tx.router as Address, 0n, data.tx.data as Hex);

      return {
        src: dst,
        dst,
        srcAmount: BigInt(data.quote.amountOut),
      };
    } catch {
      return toConvert;
    }
  }
}
