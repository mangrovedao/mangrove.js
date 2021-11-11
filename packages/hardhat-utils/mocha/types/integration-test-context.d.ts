// Extension of Mocha Context for Integration tests
import { Provider } from "@ethersproject/abstract-provider";

declare module "mocha" {
  export interface Context {
    provider: Provider;
    // FIXME Workaround for limitation with hre.network.provider - should be removed when Context.provider is fixed
    providerUrl: string;
  }
}
