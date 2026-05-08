export interface DexAggregatorQuoteResponse {
  inAmount: string;
  outAmount: string;
  inAmountRaw: string;
  outAmountRaw: string;
  executionInfo: {
    trade: {
      chainId: number;
      data: string;
      to: string;
      value: string;
    };
  } | null;
  approvals?: {
    type: string;
    to: string;
    functionName: string;
    values: {
      spender: string;
      amount: string;
    };
  }[];
  simulation?: {
    data?: string;
    amountOut?: string;
    gas?: string;
    error?: string;
  };
  tokenInUsdValue?: number;
  tokenOutUsdValue?: number;
  gasInUsdValue?: number;
  netValue?: number;
  inToken: { decimals: number };
  outToken: { decimals: number };
}
