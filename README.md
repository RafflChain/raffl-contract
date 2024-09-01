# Raffle Contract

[![Test](https://github.com/Bullrich/raffle-contract/actions/workflows/test.yml/badge.svg?branch=main&event=push)](https://github.com/Bullrich/raffle-contract/actions/workflows/test.yml)

This project contains the raffle smart contract and all of the tests.

It provides also the deployment of the contract and the generation of the types.

This project was built using [`hardhat`](https://hardhat.org/).

Available commands:

- `npm run build`: Build the smart contract
- `npm run test`: Test the smart contract.
  - You can add `REPORT_GAS=true` to the test.
- `npx hardhat pub-type`: Deploy contract interface to npm.
- `npx hardhat ignition deploy ignition/modules/Raffle.ts`: Deploy an instance of the contract into the chain.

## Installation

You can install it as a `npm library`.

![NPM Version](https://img.shields.io/npm/v/raffle-contract)

`npm install --save raffle-contract`

Find the package available in [`raffle-contract`](https://www.npmjs.com/package/raffle-contract).
