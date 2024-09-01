import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { str, envsafe, port, url, makeValidator, num } from 'envsafe';

import hre from "hardhat";


export default buildModule("Raffle", (m) => {
    const address = makeValidator<string>(input => {
        if (!hre.ethers.isAddress(input)) {
            throw new Error(`${input} is not a valid EVM address`);
        }
        return input;
    })
    const env = envsafe({
        DONATION: address(),
        PRICE: num(),
        DURATION: num(),
        TOKEN: address()
    })

    const raffle = m.contract("Raffle", [env.DONATION, env.PRICE, env.DURATION, env.TOKEN]);

    return { raffle };
});
