import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Deployment", (m) => {
  const token = m.contract("RaffleToken");

  return { token };
});
