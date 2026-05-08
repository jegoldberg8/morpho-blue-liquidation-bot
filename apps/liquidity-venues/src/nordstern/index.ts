import { ExecutorEncoder } from "executooor-viem";
import { Address, Hex } from "viem";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

import { NordsternQuoteResponse } from "./types";

const BASE_URL = "https://api.nordstern.finance";

export class NordsternVenue implements LiquidityVenue {
  supportsRoute(_encoder: ExecutorEncoder, src: Address, dst: Address) {
    return src !== dst;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    try {
      if (srcAmount <= 0n) return toConvert;

      const chainId = encoder.client.chain.id;
      const url = `${BASE_URL}/aggregator/${chainId}?src=${src}&dst=${dst}&amount=${srcAmount.toString()}&from=${encoder.address}&slippage=0.5`;

      console.log(`[Nordstern] chain=${chainId} ${src} -> ${dst} amount=${srcAmount}`);

      const response = await fetch(url);
      if (!response.ok) {
        console.log(`[Nordstern] chain=${chainId} HTTP ${response.status}`);
        return toConvert;
      }

      const data = (await response.json()) as NordsternQuoteResponse;

      if (!data.tx?.data || !data.tx?.to || !data.toAmount) {
        console.log(`[Nordstern] chain=${chainId} no route found`);
        return toConvert;
      }

      console.log(`[Nordstern] chain=${chainId} route found: ${srcAmount} -> ${data.toAmount}`);

      encoder.erc20Approve(src, data.tx.to as Address, srcAmount);
      encoder.pushCall(data.tx.to as Address, BigInt(data.tx.value || "0"), data.tx.data as Hex);

      return {
        src: dst,
        dst,
        srcAmount: BigInt(data.toAmount),
      };
    } catch {
      return toConvert;
    }
  }
}
