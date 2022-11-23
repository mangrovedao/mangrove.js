// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ThresholdBlockSubscriptions {
  export type blockSubscription = {
    seenCount: number;
    cbs: Set<(n: number) => void>;
  };
}

/* Instances of this class react to incoming blocks once the blocks have been seen enough times.

Usage:
* You register a `callback` for a given block `n` using `subscribe(n,callback)`. Once the block _or any later block_ has been seen `>= seenThreshold` times, `callback` is executed.
* You signal that a block `m` has been seen using `increaseCount(m)`. This will increase the `seenCount` of block `m`, and possibly execute all callbacks associated to blocks `m'<=m` if the updated `seenCount` is strictly greater than `seenThreshold`.

The constructor takes `lastSeen:number` argument (the starting block number), and a `seenThreshold:number` argument (the number of times a block must be seen before its associated callbacks are executed).

Motivation: a Mangrove market has two semibooks, and may receive updates from each at different times, but it should only trigger the "market has been updated" callback once both semibooks have gotten their updates. In addition, a callback for block n may be registered after block `m > n` has been observed, so this class searches through previous block's registered callbacks when it crosses a `seenThreshold`.

Callbacks are discarded before execution.

*/
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
