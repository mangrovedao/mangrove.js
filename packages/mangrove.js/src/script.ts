import { Mangrove } from "./index";
console.log("hellO?");
const main = async () => {
  const c = await Mangrove.connect("https://polygon-rpc.com");
  const o = await c.openMarkets();
  console.log(o);
  //console.log(c);
};
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.log(e);
    process.exit(1);
  });
export {};
