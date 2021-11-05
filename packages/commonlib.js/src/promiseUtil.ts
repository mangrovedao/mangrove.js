export const sleep = (ms: number) => {
  return new Promise((cb) => setTimeout(cb, ms));
};
