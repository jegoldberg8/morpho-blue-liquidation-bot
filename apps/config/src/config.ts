import {
  arbitrum,
  base,
  etherlink,
  katana,
  mainnet,
  optimism,
  sei,
  unichain,
  worldchain,
} from "viem/chains";

import { hyperevm, monad } from "./chains";
import type { Config } from "./types";

/// Bad debt realization

export const ALWAYS_REALIZE_BAD_DEBT = false; // true if you want to always realize bad debt

/// Cooldown mechanisms

export const MARKETS_FETCHING_COOLDOWN_PERIOD = 60 * 60 * 24; // 24 hours (1 day)
export const POSITION_LIQUIDATION_COOLDOWN_ENABLED = true; // true if you want to enable the cooldown mechanism
export const POSITION_LIQUIDATION_COOLDOWN_PERIOD = 60 * 30; // 30 minutes

/// Chains configurations

export const chainConfigs: Record<number, Config> = {
  [mainnet.id]: {
    chain: mainnet,
    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    options: {
      dataProvider: "morphoApi",
      vaultWhitelist: [
        "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB",
        "0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458",
      ],
      additionalMarketsWhitelist: [
        "0x1eda1b67414336cab3914316cb58339ddaef9e43f939af1fed162a989c98bc20",
        "0xff527fe9c6516f9d82a3d51422ccb031d123266e6e26d4c22c942a948c180a75",
      ],
      liquidityVenues: [
        "pendlePT",
        "midas",
        "1inch",
        "erc20Wrapper",
        "erc4626",
        "uniswapV3",
        "uniswapV4",
      ],
      pricers: ["defillama", "chainlink", "uniswapV3"],
      liquidationBufferBps: 50,
      useFlashbots: true,
      // blockInterval: 2,
    },
  },
  [base.id]: {
    chain: base,
    wNative: "0x4200000000000000000000000000000000000006",
    options: {
      dataProvider: "morphoApi",
      vaultWhitelist: ["0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183"],
      additionalMarketsWhitelist: [],
      liquidityVenues: [
        "pendlePT",
        "midas",
        "1inch",
        "erc20Wrapper",
        "erc4626",
        "uniswapV3",
        "uniswapV4",
      ],
      pricers: ["defillama", "chainlink", "uniswapV3"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      blockInterval: 10,
    },
  },
  [unichain.id]: {
    chain: unichain,
    wNative: "0x4200000000000000000000000000000000000006",
    options: {
      dataProvider: "hyperIndex",
      vaultWhitelist: "all",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["aggregator", "erc20Wrapper", "erc4626"],
      pricers: ["nordstern"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 1,
      blockInterval: 5,
    },
  },
  [katana.id]: {
    chain: katana,
    wNative: "0xEE7D8BCFb72bC1880D0Cf19822eB0A2e6577aB62",
    options: {
      dataProvider: "morphoApi",
      vaultWhitelist: "morpho-api",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["erc20Wrapper", "erc4626", "uniswapV3", "uniswapV4"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      blockInterval: 5,
    },
  },
  [arbitrum.id]: {
    chain: arbitrum,
    wNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    options: {
      dataProvider: "morphoApi",
      vaultWhitelist: "morpho-api",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["pendlePT", "1inch", "erc20Wrapper", "erc4626", "uniswapV3", "uniswapV4"],
      liquidationBufferBps: 50,
      useFlashbots: false,
    },
  },
  [worldchain.id]: {
    chain: worldchain,
    wNative: "0x4200000000000000000000000000000000000006",
    options: {
      dataProvider: "hyperIndex",
      vaultWhitelist: "all",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["aggregator", "erc20Wrapper", "erc4626"],
      // pricers: ["nordstern", "defillama", "lifi", "morphoApi"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 1,
      blockInterval: 5,
    },
  },
  [hyperevm.id]: {
    chain: hyperevm,
    wNative: "0x5555555555555555555555555555555555555555",
    options: {
      dataProvider: "morphoApi",
      vaultWhitelist: "all",
      liquidityVenues: ["hyperflow", "aggregator", "erc20Wrapper", "erc4626"],
      // pricers: ["nordstern", "lifi"],
      additionalMarketsWhitelist: [],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 0,
      blockInterval: 1,
    },
  },
  [monad.id]: {
    chain: monad,
    wNative: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
    options: {
      dataProvider: "hyperIndex",
      vaultWhitelist: "all",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["aggregator", "erc20Wrapper", "erc4626"],
      // pricers: ["defillama", "lifi", "morphoApi"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 0,
      blockInterval: 5,
    },
  },
  [optimism.id]: {
    chain: optimism,
    wNative: "0x4200000000000000000000000000000000000006",
    options: {
      dataProvider: "hyperIndex",
      vaultWhitelist: "all",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["aggregator", "erc20Wrapper", "erc4626"],
      // pricers: ["nordstern", "lifi"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 0,
      blockInterval: 5,
    },
  },
  [etherlink.id]: {
    chain: etherlink,
    wNative: "0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb",
    options: {
      dataProvider: "morphoApi",
      vaultWhitelist: "all",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["aggregator", "erc20Wrapper", "erc4626"],
      // pricers: ["nordstern", "lifi"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 0,
      blockInterval: 5,
    },
  },
  [sei.id]: {
    chain: sei,
    wNative: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
    options: {
      dataProvider: "hyperIndex",
      vaultWhitelist: "all",
      additionalMarketsWhitelist: [],
      liquidityVenues: ["aggregator", "erc20Wrapper", "erc4626"],
      // pricers: ["defillama", "lifi"],
      liquidationBufferBps: 50,
      useFlashbots: false,
      minCollateralUsd: 0,
      blockInterval: 5,
    },
  },
};
