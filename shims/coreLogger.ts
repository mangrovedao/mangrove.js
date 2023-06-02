import truncate from "json-truncate";

// This processor must be used when logging large objects, because of Winston memory consumption in that case
export const logdataLimiter = (data: Object): string => {
  return truncate(data, { maxDepth: 3, replace: "[Truncated]" });
};

export default {};
