export type TakerConfig = {
  targetAllowance: number;
  sleepTimeMilliseconds: number;
};

export type MarketConfig = {
  baseToken: string;
  quoteToken: string;
  takerConfig: TakerConfig;
};
