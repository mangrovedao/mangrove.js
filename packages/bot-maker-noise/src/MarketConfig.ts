export type MakerConfig = {
  offerRate: number;
  bidProbability: number;
  lambda: number;
  maxQuantity: number;
  maxTotalLiquidityPublished: number;
};

export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  makerConfig: MakerConfig;
};
