import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "hardhat-publish-typechain";
import { HardhatUserConfig, vars } from "hardhat/config";

import { envsafe, str } from "envsafe";

const env = envsafe({
  NPM_TOKEN: str({
    default: "npm-token",
    allowEmpty: true,
  }),
  VERSION: str({
    default: "0.0.0",
    allowEmpty: true,
  }),
});

const sepoliaNetwork = vars.has("SEPOLIA_PRIVATE_KEY")
  ? {
      url: `https://eth-sepolia.g.alchemy.com/v2/${vars.get("ALCHEMY_API_KEY")}`,
      accounts: [vars.get("SEPOLIA_PRIVATE_KEY")],
    }
  : undefined;

const ethereumNetwork = vars.has("MAINNET_PRIVATE_KEY")
  ? {
      url: `https://eth-mainnet.g.alchemy.com/v2/${vars.get("ALCHEMY_API_KEY")}`,
      accounts: [vars.get("MAINNET_PRIVATE_KEY")],
    }
  : undefined;

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  etherscan: vars.has("ETHERSCAN_API_KEY")
    ? {
        apiKey: vars.get("ETHERSCAN_API_KEY"),
      }
    : {},
  networks: {
    sepolia: sepoliaNetwork,
    mainnet: ethereumNetwork,
  },
  publishTypechain: {
    name: "raffle-contract",
    repository: "https://github.com/RafflChain/raffl-contract",
    version: env.VERSION,
    iifeGlobalObjectName: "mock",
    ignoreDeployedNetworks: ["localhost"],
    authToken: env.NPM_TOKEN,
  },
};

export default config;
