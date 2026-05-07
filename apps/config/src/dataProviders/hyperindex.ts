/**
 * HyperIndex indexer configuration.
 *
 * Deployment block numbers and additional factory addresses for each chain.
 * Used by the hyperindex config generator to produce config.yaml.
 */

export interface HyperIndexChainConfig {
  morphoStartBlock: number;
  metaMorphoFactoryStartBlock: number;
  adaptiveCurveIrmStartBlock: number;
  preLiquidationFactoryStartBlock: number;
  /** Additional MetaMorpho factory addresses beyond the primary one from blue-sdk. */
  additionalMetaMorphoFactories?: string[];
  /** Explicit HyperSync URL for chains not auto-detected by Envio. */
  hypersyncUrl?: string;
}

/**
 * Chain IDs that the HyperIndex indexer supports.
 * A chain must be listed here AND in `chainConfigs` to be indexed.
 */
export const hyperIndexChainConfigs: Record<number, HyperIndexChainConfig> = {
  1: {
    morphoStartBlock: 18_883_124,
    metaMorphoFactoryStartBlock: 18_925_584,
    adaptiveCurveIrmStartBlock: 18_883_124,
    preLiquidationFactoryStartBlock: 21_414_664,
    additionalMetaMorphoFactories: ["0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101"],
  },
  8453: {
    morphoStartBlock: 13_977_148,
    metaMorphoFactoryStartBlock: 13_978_134,
    adaptiveCurveIrmStartBlock: 13_977_152,
    preLiquidationFactoryStartBlock: 23_779_056,
    additionalMetaMorphoFactories: ["0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101"],
  },
  130: {
    morphoStartBlock: 9_139_027,
    metaMorphoFactoryStartBlock: 9_316_789,
    adaptiveCurveIrmStartBlock: 9_139_027,
    preLiquidationFactoryStartBlock: 9_381_237,
  },
  42161: {
    morphoStartBlock: 296_446_593,
    metaMorphoFactoryStartBlock: 296_447_195,
    adaptiveCurveIrmStartBlock: 296_446_593,
    preLiquidationFactoryStartBlock: 307_326_238,
  },
  480: {
    morphoStartBlock: 9_025_669,
    metaMorphoFactoryStartBlock: 9_025_733,
    adaptiveCurveIrmStartBlock: 9_025_669,
    preLiquidationFactoryStartBlock: 10_273_494,
  },
  143: {
    morphoStartBlock: 31_907_457,
    metaMorphoFactoryStartBlock: 32_320_327,
    adaptiveCurveIrmStartBlock: 31_907_457,
    preLiquidationFactoryStartBlock: 32_321_504,
  },
  999: {
    morphoStartBlock: 1_988_429,
    metaMorphoFactoryStartBlock: 1_988_677,
    adaptiveCurveIrmStartBlock: 1_988_429,
    preLiquidationFactoryStartBlock: 1_988_956,
  },
  42793: {
    morphoStartBlock: 21_047_448,
    metaMorphoFactoryStartBlock: 21_050_315,
    adaptiveCurveIrmStartBlock: 21_047_448,
    preLiquidationFactoryStartBlock: 21_050_766,
    hypersyncUrl: "https://etherlink.hypersync.xyz",
  },
};

export const hyperIndexChainIds = Object.keys(hyperIndexChainConfigs).map(Number);
