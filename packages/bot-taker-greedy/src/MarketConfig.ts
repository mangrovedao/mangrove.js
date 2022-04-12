export type TakerConfig = {
  sleepTimeMilliseconds: number;
  offerCountCap: number;
};

export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  takerConfig: TakerConfig;
};
