// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DemoToken is ERC20 {
    constructor() ERC20("DemoToken", "DT") {
        _mint(msg.sender, 50000 * (10 ** decimals()));
    }
}
