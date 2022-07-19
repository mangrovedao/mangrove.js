const { ethers } = require("ethers");
const { Mangrove, eth } = require("../../src");
const { testServer } = require("../../src/util/testServer");

const params = {
  host: "127.0.0.1",
  port: 8546,
  pipeAnvil: false,
};

exports.mochaHooks = {
  async beforeAll() {
    this.server = await testServer(params);
    this.accounts = {
      deployer: this.server.accounts[0],
      tester: this.server.accounts[1],
    };

    const provider = new ethers.providers.JsonRpcProvider(this.server.url);

    const network = await eth.getProviderNetwork(provider);

    for (const [name, address] of Object.entries(
      this.server.contracts as { [index: string]: string }
    )) {
      Mangrove.setAddress(name, address, network.name);
      if (this.server.tokens.includes(name)) {
        await Mangrove.fetchDecimals(name, provider);
      }
    }

    const mgv = await Mangrove.connect({
      provider,
      privateKey: this.accounts.deployer.key,
    });

    const tokenA = mgv.token("TokenA");
    const tokenB = mgv.token("TokenB");
    //shorten polling for faster tests
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    mgv._provider.pollingInterval = 10;
    await mgv.fundMangrove(10, this.accounts.deployer.address);
    // await mgv.contract["fund()"]({ value: mgv.toUnits(10,18) });

    await mgv.contract
      .activate(tokenA.address, tokenB.address, 0, 10, 20000)
      .then((tx) => tx.wait());
    await mgv.contract
      .activate(tokenB.address, tokenA.address, 0, 10, 20000)
      .then((tx) => tx.wait());

    console.log("MGV 1", mgv._address);

    await tokenA.contract.mint(
      this.accounts.tester.address,
      mgv.toUnits(10, 18)
    );
    await tokenB.contract.mint(
      this.accounts.tester.address,
      mgv.toUnits(10, 18)
    );

    await mgv.fundMangrove(10, this.server.contracts.SimpleTestMaker);
    // await mgvContract["fund(address)"](testMakerContract.address, {
    //   value: toWei(10),
    // }).then((tx) => tx.wait());

    await this.server.snapshot();
  },

  async beforeEach() {
    await this.server.revert();
    await this.server.snapshot();

    // // must recreate provider/signers after each revert otherwise
    // // they will be out of sync
    // const deployer = new ethers.Wallet(
    //   server.accounts.deployer.key,
    //   provider
    // );
    // // const deployerAddress = await deployer.getAddress();

    // const tester = new ethers.Wallet(
    //   server.accounts.account1.key,
    //   provider
    // );

    // this.signers = {
    //   deployer,
    //   tester
    // };
  },

  async afterAll() {
    if (this.server.process) {
      this.server.process.kill();
    }
  },
};
