import { EventEmitter } from "stream";

export const RELIABLE_PROVIDER_ERROR_CHANNEL = `reliableProviderError`;

export const onEthersError =
  (emitter: EventEmitter) =>
  (error: any): boolean => {
    if (error instanceof Error) {
      // do nothing for nous
    }
    console.error(error);
    emitter.emit(RELIABLE_PROVIDER_ERROR_CHANNEL, error);
    return false;
  };
