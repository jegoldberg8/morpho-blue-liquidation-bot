export const CANOE_BASE_URL = process.env.CANOE_BASE_URL ?? "http://localhost:3333";

export const CANOE_CHAIN_NAMES: Record<number, string> = {
  480: "worldchain",
  999: "hyperevm",
  42793: "etherlink",
};
