export type MakerConfig = {
  offerRate: number;
  bidProbability: number;
  lambda: number;
  maxQuantity: number;
};

export type TakerConfig = {
  takeRate: number;
  bidProbability: number;
  maxQuantity: number;
};

export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  makerConfig: MakerConfig;
  takerConfig: TakerConfig;
};
