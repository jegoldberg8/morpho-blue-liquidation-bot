import type { Address, Chain, Hex } from "viem";

export type LiquidityVenueName =
  | "1inch"
  | "canoe"
  | "erc20Wrapper"
  | "erc4626"
  | "liquidSwap"
  | "midas"
  | "pendlePT"
  | "uniswapV3"
  | "uniswapV4";

export type PricerName = "canoe" | "chainlink" | "defillama" | "morphoApi" | "uniswapV3";

export type DataProviderName = "morphoApi" | "hyperIndex";

export interface Config {
  chain: Chain;
  wNative: Address;
  options: Options;
}

export interface Options {
  dataProvider: DataProviderName;
  vaultWhitelist: Address[] | "morpho-api" | "all";
  additionalMarketsWhitelist: Hex[];
  liquidityVenues: LiquidityVenueName[];
  pricers?: PricerName[];
  treasuryAddress?: Address;
  liquidationBufferBps?: number;
  useFlashbots: boolean;
  blockInterval?: number;
  watchBlocksRetryDelayMs?: number;
  skipSimulation?: boolean;
  /** Minimum seizable collateral (in USD) to attempt liquidation. Skips dust positions. */
  minCollateralUsd?: number;
}

export type ChainConfig = Omit<Config, "options"> &
  Options & {
    chainId: number;
    rpcUrl: string;
    executorAddress: Address;
    liquidationPrivateKey: Hex;
  };
