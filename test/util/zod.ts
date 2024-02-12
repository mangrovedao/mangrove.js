import { ZodError } from "zod";

export const zodError = (message: string, prop: string) => {
  return new ZodError([{ code: "custom", message, path: [prop] }]);
};
