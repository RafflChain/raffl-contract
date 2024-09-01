import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import 'hardhat-publish-typechain';
import { HardhatUserConfig } from "hardhat/config";


import { envsafe, str } from "envsafe";

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
  NPM_TOKEN: str({
    default: "npm-token",
    allowEmpty: true,
  }),
  VERSION: str({
    default: "0.0.0",
    allowEmpty: true
  })
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
  publishTypechain: {
    name: "raffle-contract",
    repository: "https://github.com/Bullrich/raffle-contract",
    version: env.VERSION,
    includeDeployed: true,
    iifeGlobalObjectName: "mock",
    ignoreDeployedNetworks: ["localhost"],
    authToken: env.NPM_TOKEN,
  }
};

export default config;
