// FIXME: The logger has been stunted by removing the dependency to commonlib.js
//        as a temporary workaround for issue #220 and issue #226.
//        To avoid reverting a merge commit and the burden of maintaining that old feature branch,
//        we have opted to keep most of the logging code but only support simplified logging to console.
//
//        For references on why we want to avoid revert merge commits:
//          Long (Linus): https://github.com/git/git/blob/master/Documentation/howto/revert-a-faulty-merge.txt
//          Short: https://www.datree.io/resources/git-undo-merge

import inspect from "object-inspect";

const stringifyData = (data) => {
  if (typeof data == "string") return data;
  else return inspect(data);
};

// FIXME: Temporary copy until issue #220 is fixed
export const logdataLimiter = (data: Record<string, any>): any => {
  return inspect(data, { maxStringLength: 1000 });
};

// FIXME: Temporary dumb implementation until issue #220 is fixed
export const logger = {
  debug: (msg: unknown, data: unknown): void => {
    console.log(msg + " " + stringifyData(data));
  },
  warn: (msg: unknown, data: unknown): void => {
    console.warn(msg + " " + stringifyData(data));
  },
};

export default logger;
