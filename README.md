# Raffle Contract

[![Test](https://github.com/RafflChain/raffl-contract/actions/workflows/test.yml/badge.svg?branch=main&event=push)](https://github.com/RafflChain/raffl-contract/actions/workflows/test.yml)

This project contains the raffle smart contract and all of the tests for the [Raffl Chain](https://rafflchain.com).

It provides also the deployment of the contract and the generation of the types.

This project was built using [`hardhat`](https://hardhat.org/).

Available commands:

- `npm run build`: Build the smart contract
- `npm run test`: Test the smart contract.
  - You can add `REPORT_GAS=true` to the test.
- `npx hardhat pub-type`: Deploy contract interface to npm.
- `npx hardhat docgen`: To generate the contract documentation.

## Deploy contract

### Raffle

You need to run `npx hardhat ignition deploy ignition/modules/Raffle.ts --network sepolia --verify` with the following env variables:

- `PRICE`: Price of the tickets **in ETH** (for example _0.001_).
- `DURATION`: duration of the Raffle in days.

You can also use the `workflow_dispatch` to deploy it for you: [![Deploy Contract](https://github.com/RafflChain/raffl-contract/actions/workflows/deploy-contract.yml/badge.svg?event=workflow_dispatch)](https://github.com/RafflChain/raffl-contract/actions/workflows/deploy-contract.yml)

## Installation

You can install it as a `npm library`.

![NPM Version](https://img.shields.io/npm/v/raffle-contract)

`npm install --save raffle-contract`

Find the package available in [`raffle-contract`](https://www.npmjs.com/package/raffle-contract).
