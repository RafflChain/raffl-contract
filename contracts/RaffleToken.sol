// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Demo Token used for testing
/// @author @Bullrich
contract RaffleToken is ERC20 {
    constructor() ERC20("Raffle Test Token", "RTT") {
        _mint(msg.sender, 1000 * (10 ** decimals()));
    }
}
