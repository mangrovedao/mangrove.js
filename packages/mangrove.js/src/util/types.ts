export type Result<T, E = Error> =
  | { ok: T; error: undefined }
  | { ok: undefined; error: E };
