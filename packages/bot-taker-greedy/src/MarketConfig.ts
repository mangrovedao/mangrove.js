export type TakerConfig = {
  targetAllowance: number;
  takeRate: number;
  bidProbability: number;
  maxQuantity: number;
};

export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  takerConfig: TakerConfig;
};
