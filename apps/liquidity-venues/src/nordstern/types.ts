export interface NordsternQuoteResponse {
  src: string;
  dst: string;
  fromAmount: string;
  toAmount: string;
  tx: {
    data: string;
    from: string;
    to: string;
    value: string;
  };
}
