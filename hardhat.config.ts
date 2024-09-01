import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomiclabs/hardhat-solhint";
import "@nomicfoundation/hardhat-toolbox";

import { envsafe, makeValidator, num, str } from 'envsafe';

const env = envsafe({
  ALCHEMY_API_KEY: str({
    default: "ALCHEMY_API_KEY"
  }),
  SEPOLIA_PRIVATE_KEY: str({
    default: "SEPOLIA_PRIVATE_KEY"
  }),
  ETHERSCAN_API_KEY: str({
    default: "ETHERSCAN_API_KEY"
  })
});


const config: HardhatUserConfig = {
  solidity: "0.8.24",
  etherscan: {
    apiKey: env.ETHERSCAN_API_KEY,
  },
  networks: {
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`,
      accounts: [env.SEPOLIA_PRIVATE_KEY],
    },
  }
};

export default config;
