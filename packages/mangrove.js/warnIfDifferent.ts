import { compare } from "dir-compare";
import { red } from "chalk";

const main = async () => {
  const result = await compare(process.argv[3], process.argv[4], {
    compareContent: true,
    noDiffSet: true,
  });

  if (!result.same) {
    console.warn(red(process.argv[5]));
  }
};

main();
