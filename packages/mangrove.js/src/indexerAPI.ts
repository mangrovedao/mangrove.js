import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  gql,
} from "@apollo/client";

class MangroveIndexAPI {
  async query(q: string) {
    const client = new ApolloClient({
      uri: "https://mumbai-indexer-mirror.herokuapp.com/",
      cache: new InMemoryCache(),
    });

    return client.query({
      query: gql`
        ${q}
      `,
    });
  }

  async getAccountId(address: string, chainId: number) {
    const result = await this.query(`query findAccount {
            accounts( take: 1, where: {chainId: { equals: ${chainId}}, address: { equals: "${address}"} }){
                  id
            },
          }`);
    if (result.data.accounts.length == 0) {
      throw new Error("No Account found");
    }
    return result.data.accounts[0].id;
  }

  async getMangroveId(address: string, chainId: number) {
    const result = await this.query(`query findMangrove{
            mangroves( take: 1, where: { chainId: {equals: ${chainId}}, address: { equals: "${address}"}}) {
              id,
            }
          }`);
    if (result.data.mangroves.length == 0) {
      throw new Error("No Mangroves found");
    }
    return result.data.mangroves[0].id;
  }

  async getStratId(address: string, chainId: number) {
    const result = await this.query(`query findStrat{
            strats( take: 1, where: {account: { is: { address: { equals: "${address}"}, chainId: { equals: ${chainId}} } } } ) {
              id
            }
          }`);
    if (result.data.strats.length == 0) {
      throw new Error("No strats found");
    }
    return result.data.strats[0].id;
  }

  async getOrderSummaries(
    chainId: number,
    mangroveAddress: string,
    stratAddress: string,
    takerAddress: string
  ) {
    const mangroveId = await this.getMangroveId(mangroveAddress, chainId);
    const takerId = await this.getAccountId(takerAddress, chainId);
    const stratId = await this.getStratId(stratAddress, chainId);
    return this.getOrderSummariesWithIds(mangroveId, stratId, takerId);
  }

  async getOrderSummariesWithIds(
    mangroveId: string,
    stratId: string,
    takerId: string
  ) {
    const result = await this.query(`query findOrderSummaries{
            orderSummaries( where: 
            { mangroveId: { equals: "${mangroveId}"}, stratId: { equals: "${stratId}"}, takerId: { equals: "${takerId}"} }) {
              selling,
              takerGot,
              takerGotNumber,
              takerGave,
              takerGaveNumber,
              price,
              penalty,
              penaltyNumber,
              restingOrderId,
              offerList {
                id,
                outboundToken {
                  address,
                  name,
                  id
                ,}
                inboundToken {
                  address,
                  name,
                  id
                }
              }
            }
          }`);
    if (result.data.orderSummaries.length == 0) {
      throw new Error("No orderSummaries found");
    }
    return result.data.orderSummaries;
  }
}

export default MangroveIndexAPI;
