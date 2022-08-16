// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ThresholdBlockSubscriptions {
  export type blockSubscription = {
    seenCount: number;
    cbs: Set<(n: number) => void>;
  };
}

class ThresholdBlockSubscriptions {
  #byBlock: Map<number, ThresholdBlockSubscriptions.blockSubscription>;
  #lastSeen: number;
  #seenThreshold: number;

  constructor(lastSeen: number, seenThreshold: number) {
    this.#seenThreshold = seenThreshold;
    this.#lastSeen = lastSeen;
    this.#byBlock = new Map();
  }

  #get(n: number): ThresholdBlockSubscriptions.blockSubscription {
    return this.#byBlock.get(n) || { seenCount: 0, cbs: new Set() };
  }

  #set(n, seenCount, cbs) {
    this.#byBlock.set(n, { seenCount, cbs });
  }

  // assumes increaseCount(n) is called monotonically in n
  increaseCount(n: number): void {
    // seeing an already-seen-enough block (should not occur)
    if (n <= this.#lastSeen) {
      return;
    }

    const { seenCount, cbs } = this.#get(n);

    this.#set(n, seenCount + 1, cbs);

    // havent seen the block enough times
    if (seenCount + 1 < this.#seenThreshold) {
      return;
    }

    const prevLastSeen = this.#lastSeen;
    this.#lastSeen = n;

    // clear all past callbacks
    for (let i = prevLastSeen + 1; i <= n; i++) {
      const { cbs: _cbs } = this.#get(i);
      this.#byBlock.delete(i);
      for (const cb of _cbs) {
        cb(i);
      }
    }
  }

  subscribe<T>(n: number, cb: (number) => T): Promise<T> {
    if (this.#lastSeen >= n) {
      return Promise.resolve(cb(n));
    } else {
      const { seenCount, cbs } = this.#get(n);
      return new Promise((ok, ko) => {
        const _cb = (n) => Promise.resolve(cb(n)).then(ok, ko);
        this.#set(n, seenCount, cbs.add(_cb));
      });
    }
  }
}

export default ThresholdBlockSubscriptions;
