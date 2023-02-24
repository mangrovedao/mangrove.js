export class Deferred<T = void> {
  public readonly promise: Promise<T>;
  #resolve!: (value: T | PromiseLike<T>) => void;
  #reject!: (reason?: any) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  resolve(value: T | PromiseLike<T>): void {
    this.#resolve(value);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  reject(reason?: any): void {
    this.#reject(reason);
  }
}

// make objects watchable
// new Watcher(obj) wraps obj in a watchable proxy (accessible through watcher.proxy)
// watcher.watchFor(test) will resolve once a property (k,v) of proxy has been set that satisfies test(k,v). test can return a promise.
type watcher = {
  test: (k: any, v: any) => boolean | Promise<boolean>;
  ok: () => void;
};
export class Watcher {
  proxy: any;
  watchers: Set<watcher>;

  constructor(target: any) {
    this.watchers = new Set();
    this.proxy = new Proxy(target, {
      set: (target, key, value) => {
        target[key] = value;
        for (const packed of this.watchers) {
          Promise.resolve(packed.test(key, value)).then((result) => {
            if (result) {
              this.watchers.delete(packed);
              packed.ok();
            }
          });
        }
        return true;
      },
    });
  }

  watchFor(
    test: (k: any, v: any) => boolean | Promise<boolean>
  ): Promise<void> {
    return new Promise<void>((ok) => {
      this.watchers.add({ test, ok });
    });
  }
}
