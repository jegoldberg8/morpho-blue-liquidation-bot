export const DEX_AGGREGATOR_URL = process.env.DEX_AGGREGATOR_URL ?? "";

export const DEX_AGGREGATOR_CHAIN_NAMES: Record<number, string> = {
  10: "optimism",
  130: "unichain",
  143: "monad",
  480: "worldchain",
  999: "hyperevm",
  42793: "etherlink",
};
