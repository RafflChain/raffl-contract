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
    FIXED_PRIZE: num(),
  });

  const raffle = m.contract("Raffle", [
    hre.ethers.parseUnits(env.PRICE.toString(), "ether"),
    env.DURATION,
    hre.ethers.parseUnits(env.FIXED_PRIZE.toString(), "ether"),
  ]);

  return { raffle };
});
