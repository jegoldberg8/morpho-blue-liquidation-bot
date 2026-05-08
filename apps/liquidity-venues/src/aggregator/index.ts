import { ExecutorEncoder } from "executooor-viem";
import { Address, Hex } from "viem";

import { LiquidityVenue } from "../liquidityVenue";
import { ToConvert } from "../types";

const ENSO_URL = "https://api.enso.finance/api/v1/shortcuts/route";
const ENSO_KEY = process.env.ENSO_API_KEY ?? "";
const NORDSTERN_URL = "https://api.nordstern.finance";
const ZEROX_URL = "https://api.0x.org/swap/allowance-holder/quote";
const ZEROX_KEY = process.env.ZEROX_API_KEY ?? "";

interface QuoteResult {
  toAmount: bigint;
  to: Address;
  data: Hex;
  value: bigint;
}

async function fetchEnso(
  chainId: number,
  src: Address,
  dst: Address,
  amount: bigint,
  from: Address,
): Promise<QuoteResult> {
  if (!ENSO_KEY) throw new Error("no key");
  const params = new URLSearchParams({
    chainId: chainId.toString(),
    fromAddress: from,
    tokenIn: src,
    tokenOut: dst,
    amountIn: amount.toString(),
    routingStrategy: "router",
    slippage: "300",
  });
  const res = await fetch(`${ENSO_URL}?${params}`, {
    headers: { Authorization: `Bearer ${ENSO_KEY}` },
  });
  if (!res.ok) throw new Error(`enso ${res.status}`);
  const data = (await res.json()) as {
    amountOut: string;
    tx: { to: string; data: string; value: string };
  };
  if (!data.tx?.data || !data.amountOut) throw new Error("enso no route");
  return {
    toAmount: BigInt(data.amountOut),
    to: data.tx.to as Address,
    data: data.tx.data as Hex,
    value: BigInt(data.tx.value || "0"),
  };
}

async function fetchNordstern(
  chainId: number,
  src: Address,
  dst: Address,
  amount: bigint,
  from: Address,
): Promise<QuoteResult> {
  const res = await fetch(
    `${NORDSTERN_URL}/aggregator/${chainId}?src=${src}&dst=${dst}&amount=${amount}&from=${from}&slippage=0.5`,
  );
  if (!res.ok) throw new Error(`nordstern ${res.status}`);
  const data = (await res.json()) as {
    toAmount: string;
    tx: { to: string; data: string; value: string };
  };
  if (!data.tx?.data || !data.tx?.to || !data.toAmount || data.toAmount === "0")
    throw new Error("nordstern no route");
  return {
    toAmount: BigInt(data.toAmount),
    to: data.tx.to as Address,
    data: data.tx.data as Hex,
    value: BigInt(data.tx.value || "0"),
  };
}

async function fetchZeroEx(
  chainId: number,
  src: Address,
  dst: Address,
  amount: bigint,
  taker: Address,
): Promise<QuoteResult> {
  if (!ZEROX_KEY) throw new Error("no key");
  const params = new URLSearchParams({
    chainId: chainId.toString(),
    sellToken: src,
    buyToken: dst,
    sellAmount: amount.toString(),
    taker,
    slippageBps: "300",
  });
  const res = await fetch(`${ZEROX_URL}?${params}`, {
    headers: { "0x-api-key": ZEROX_KEY, "0x-version": "v2" },
  });
  if (!res.ok) throw new Error(`0x ${res.status}`);
  const data = (await res.json()) as {
    buyAmount: string;
    liquidityAvailable: boolean;
    transaction: { to: string; data: string; value: string };
  };
  if (!data.liquidityAvailable || !data.transaction?.data || !data.buyAmount)
    throw new Error("0x no route");
  return {
    toAmount: BigInt(data.buyAmount),
    to: data.transaction.to as Address,
    data: data.transaction.data as Hex,
    value: BigInt(data.transaction.value || "0"),
  };
}

export class AggregatorVenue implements LiquidityVenue {
  supportsRoute(_encoder: ExecutorEncoder, src: Address, dst: Address) {
    return src !== dst;
  }

  async convert(encoder: ExecutorEncoder, toConvert: ToConvert) {
    const { src, dst, srcAmount } = toConvert;

    try {
      if (srcAmount <= 0n) return toConvert;

      const chainId = encoder.client.chain.id;
      const quote = await this.fetchBestQuote(chainId, src, dst, srcAmount, encoder.address);
      if (!quote) return toConvert;

      encoder.erc20Approve(src, quote.to, srcAmount);
      encoder.pushCall(quote.to, quote.value, quote.data);

      return { src: dst, dst, srcAmount: quote.toAmount };
    } catch {
      return toConvert;
    }
  }

  private async fetchBestQuote(
    chainId: number,
    src: Address,
    dst: Address,
    amount: bigint,
    from: Address,
  ): Promise<QuoteResult | null> {
    try {
      return await Promise.any([
        fetchEnso(chainId, src, dst, amount, from),
        fetchNordstern(chainId, src, dst, amount, from),
        fetchZeroEx(chainId, src, dst, amount, from),
      ]);
    } catch {
      return null;
    }
  }
}
