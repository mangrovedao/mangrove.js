export class Deferred<T = any> {
  public readonly promise: Promise<T>;
  #resolve: (value?: T | PromiseLike<T>) => void;
  #reject: (reason?: any) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  resolve(value?: T | PromiseLike<T>): void {
    this.#resolve(value);
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  reject(reason?: any): void {
    this.#reject(reason);
  }
}
