export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  offerRate: number;
  bidProbability: number;
  lambda: number;
  maxQuantity: number;
};
