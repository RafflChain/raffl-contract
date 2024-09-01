// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// Author @Bullrich
contract Raffle {
    address[] public players;
    address private owner;
    address public donationAddress;
    uint public raffleEndDate;
    uint public pot;
    uint public ticketPrice;
    uint public price10Tickets;
    uint public price100Tickets;
    IERC20Metadata public token;

    constructor(
        address donation,
        uint _ticketPrice,
        uint8 daysToEndDate,
        IERC20Metadata _token
    ) {
        raffleEndDate = getFutureTimestamp(daysToEndDate);
        require(
            block.timestamp < raffleEndDate,
            "Unlock time should be in the future"
        );
        owner = payable(msg.sender);
        donationAddress = donation;
        token = _token;
        ticketPrice = _ticketPrice * (10 ** token.decimals());
        price10Tickets = ticketPrice * 8;
        price100Tickets = ticketPrice * 60;
    }

    function buyCollectionOfTickets(
        uint amountOfTickets,
        uint totalPrice
    ) private returns (uint) {
        require(block.timestamp < raffleEndDate, "Raffle is over");
        require(amountOfTickets > 0, "Can not buy 0 tickets");
        require(totalPrice >= ticketPrice, "Price is too low");
        require(token.balanceOf(msg.sender) >= totalPrice, "Insuficient funds");
        require(
            token.allowance(msg.sender, address(this)) >= totalPrice,
            "Insuficient Allowance"
        );

        token.transferFrom(msg.sender, address(this), totalPrice);
        pot += totalPrice;
        for (uint256 i = 0; i < amountOfTickets; i++) {
            players.push(msg.sender);
        }
        return amountOfTickets;
    }

    function buySingleTicket() public payable returns (uint) {
        return buyCollectionOfTickets(1, ticketPrice);
    }

    function buy10Tickets() public payable returns (uint) {
        return buyCollectionOfTickets(10, price10Tickets);
    }

    function buy100Tickets() public payable returns (uint) {
        return buyCollectionOfTickets(100, price100Tickets);
    }

    function countUserTickets() public view returns (uint) {
        uint tickets = 0;
        for (uint256 i = 0; i < players.length; i++) {
            tickets++;
        }
        return tickets;
    }

    // Function to calculate the timestamp X days from now
    function getFutureTimestamp(
        uint8 daysFromNow
    ) private view returns (uint256) {
        require(daysFromNow > 0, "Future timestamp must be at least 1 day");
        // Convert days to seconds
        uint256 futureTimestamp = block.timestamp + (daysFromNow * 1 days);
        return futureTimestamp;
    }

    uint counter = 1;

    function random() private returns (uint) {
        counter++;
        return
            uint(
                keccak256(
                    abi.encodePacked(
                        block.prevrandao,
                        block.timestamp,
                        players,
                        counter
                    )
                )
            );
    }

    function pickRandomWinner() private returns (address) {
        uint index = random() % players.length;
        return players[index];
    }

    function finishRaffle() public {
        require(msg.sender == owner, "Invoker must be the owner");
        require(
            block.timestamp > raffleEndDate,
            "End date has not being reached yet"
        );
        require(pot > 0, "The pot is empty. Raffle is invalid");

        address winner = pickRandomWinner();
        // Divide into parts
        uint halfOfPot = pot / 2;
        token.transfer(winner, halfOfPot);
        uint commision = (halfOfPot / 100) * 5;
        token.transfer(donationAddress, halfOfPot - commision);
        token.transfer(owner, commision);
    }
}
