import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomiclabs/hardhat-solhint";
import "@nomicfoundation/hardhat-toolbox";

import { envsafe, makeValidator, num, str } from "envsafe";

const env = envsafe({
  ALCHEMY_API_KEY: str({
    default: "",
    allowEmpty: true,
  }),
  SEPOLIA_PRIVATE_KEY: str({
    default: "",
    allowEmpty: true,
  }),
  ETHERSCAN_API_KEY: str({
    default: "",
    allowEmpty: true,
  }),
});

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  etherscan: {
    apiKey: env.ETHERSCAN_API_KEY,
  },
  networks: env.SEPOLIA_PRIVATE_KEY
    ? {
        sepolia: {
          url: `https://eth-sepolia.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
          accounts: [env.SEPOLIA_PRIVATE_KEY],
        },
      }
    : {},
};

export default config;
