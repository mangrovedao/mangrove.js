export const sleep = (delayMs: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
