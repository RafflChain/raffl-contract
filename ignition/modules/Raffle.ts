import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { envsafe, makeValidator, num } from "envsafe";

import hre from "hardhat";

export default buildModule("Deployment", (m) => {
  const address = makeValidator<string>((input) => {
    if (!hre.ethers.isAddress(input)) {
      throw new Error(`${input} is not a valid EVM address`);
    }
    return input;
  });
  const env = envsafe({
    PRICE: num(),
    DURATION: num(),
    TOKEN: address(),
  });

  const raffle = m.contract("Raffle", [env.PRICE, env.DURATION, env.TOKEN]);

  return { raffle };
});
