import { EventEmitter } from "stream";
import logger from "./logger";

export const RELIABLE_PROVIDER_ERROR_CHANNEL = `reliableProviderError`;

export const onEthersError =
  (emitter: EventEmitter) =>
  (error: any): boolean => {
    logger.error(`error: ${error}`);
    emitter.emit(RELIABLE_PROVIDER_ERROR_CHANNEL, error);
    return false;
  };
