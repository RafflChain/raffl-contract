import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { envsafe, makeValidator } from "envsafe";

import hre from "hardhat";

export default buildModule("FinishRaffle", (m) => {
  const address = makeValidator<string>((input) => {
    if (!hre.ethers.isAddress(input)) {
      throw new Error(`${input} is not a valid EVM address`);
    }
    return input;
  });

  const env = envsafe({
    CONTRACT_ADDRESS: address(),
    DONATION_ADDRESS: address(),
  });

  const raffle = m.contractAt("Raffle", env.CONTRACT_ADDRESS);

  m.call(raffle, "finishRaffle", [env.DONATION_ADDRESS]);

  return { raffle };
});
