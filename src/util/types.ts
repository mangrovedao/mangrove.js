export type Result<T, E = Error> =
  | { ok: T; error: undefined }
  | { ok: undefined; error: E };

/**
 * @desc Transform a nested type definition into a flat one.
 * @example
 * type Ugly = ...;
 *       ^| type Ugly = Pick<..., "a" | "b"> & Omit<..., "a" | "b">;
 * type Pretty = Prettify<Ugly>;
 *       ^| type Pretty = { a: number; b: number; test: string; ... }
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line @typescript-eslint/ban-types
} & {};
