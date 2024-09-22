// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title Raffle contract to start a raffle with as many users as possible
/// @author @Bullrich
/// @notice Only the deployer of the contract can finish the raffle
/// @custom:security-contact info+security@rafflchain.com
contract Raffle {
    /// Array with all the players participating. Each element represents a ticket
    address[] public players;
    /// Address of the deployer of the contract.
    /// @notice This is the user that can finalize the raffle and receives the commision
    address private immutable owner;
    /// Timestamp of when the raffle ends
    uint public immutable raffleEndDate;
    /// Total amount of the tokens in the contract
    uint public pot;
    /// Price of an individual ticket
    uint public immutable ticketPrice;
    /// Price of 10 tickets
    /// @notice the price is lower than actually buying 10 tickets individually to attract more purchases
    uint public immutable price10Tickets;
    /// Price of 100 tickets
    /// @notice the price is lower than actually buying 100 tickets individually to attract more purchases
    uint public immutable price100Tickets;
    /// Token used in the contract as the currency
    IERC20Metadata public immutable token;

    /// Address of the winner
    /// @dev this value is set up only after the raffle end
    address public winner;

    /// @param _ticketPrice Price of each ticket (without the decimals)
    /// @param daysToEndDate Duration of the Raffle (in days)
    /// @param _token Address of the ERC20 token that will be used in the Raffle
    constructor(uint _ticketPrice, uint8 daysToEndDate, IERC20Metadata _token) {
        raffleEndDate = getFutureTimestamp(daysToEndDate);
        require(block.timestamp < raffleEndDate, "Unlock time should be in the future");
        owner = msg.sender;
        token = _token;
        ticketPrice = _ticketPrice * (10 ** token.decimals());
        price10Tickets = ticketPrice * 8;
        price100Tickets = ticketPrice * 60;
    }

    /// Utility method used to buy any given amount of tickets
    /// @param amountOfTickets current amount of tickets (must be bigger than 0)
    /// @param totalPrice Price of the collection of tickets (must be at least the price of one ticket)
    function buyCollectionOfTickets(uint amountOfTickets, uint totalPrice) private returns (uint) {
        require(block.timestamp < raffleEndDate, "Raffle is over");
        require(amountOfTickets > 0, "Can not buy 0 tickets");
        require(totalPrice >= ticketPrice, "Price is too low");
        require(msg.sender != owner, "Owner cannot participate in the Raffle");
        require(token.balanceOf(msg.sender) >= totalPrice, "Insufficient funds");
        require(token.allowance(msg.sender, address(this)) >= totalPrice, "Insufficient Allowance");

        token.transferFrom(msg.sender, address(this), totalPrice);
        pot += totalPrice;
        for (uint256 i = 0; i < amountOfTickets; i++) {
            players.push(msg.sender);
        }
        return amountOfTickets;
    }

    /// Buy an individual ticket
    function buySingleTicket() public returns (uint) {
        return buyCollectionOfTickets(1, ticketPrice);
    }

    /// Buy a collection of 10 tickets
    function buy10Tickets() public returns (uint) {
        return buyCollectionOfTickets(10, price10Tickets);
    }

    /// Buy a collection of 100 tickets
    function buy100Tickets() public returns (uint) {
        return buyCollectionOfTickets(100, price100Tickets);
    }

    /// First ticket is free
    function getFreeTicket() public returns (uint) {
        require(countUserTickets() == 0, "User already owns tickets");
        require(msg.sender != owner, "Owner can not participate in the Raffle");
        players.push(msg.sender);
        return 1;
    }

    /// Check how many tickets the current user has
    /// @return amount of tickets the user owns
    function countUserTickets() public view returns (uint) {
        uint tickets = 0;
        for (uint256 i = 0; i < players.length; i++) {
            tickets++;
        }
        return tickets;
    }

    /// Function to calculate the timestamp X days from now
    function getFutureTimestamp(uint8 daysFromNow) private view returns (uint256) {
        require(daysFromNow > 0, "Future timestamp must be at least 1 day");
        // Convert days to seconds
        uint256 futureTimestamp = block.timestamp + (daysFromNow * 1 days);
        return futureTimestamp;
    }

    /// List all the tickets in the system
    /// @notice Can only be invoked by the contract owner
    function listSoldTickets() public view returns (uint256) {
        require(msg.sender == owner, "Invoker must be the owner");
        return players.length;
    }

    /// Value used to generate randomness
    uint private counter = 1;

    function random() private returns (uint) {
        counter++;
        return uint(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, players, counter)));
    }

    function pickRandomWinner() private returns (address) {
        uint index = random() % players.length;
        return players[index];
    }

    /// See what would be the prize pool with the current treasury
    function prizePool() public view returns (uint) {
        return pot / 2;
    }

    /// See what amount would be donated to the charity with the current treasury
    function donationAmount() public view returns (uint) {
        uint halfOfPot = prizePool();
        uint commision = (halfOfPot / 100) * 5;
        return halfOfPot - commision;
    }

    /// Method used to finish a raffle
    /// @param donationAddress Address of the charity that will receive the tokens
    /// @notice Can only be called by the owner after the timestamp of the raffle has been reached
    function finishRaffle(address donationAddress) public returns (address) {
        require(msg.sender == owner, "Invoker must be the owner");
        require(block.timestamp > raffleEndDate, "End date has not being reached yet");
        require(pot > 0, "The pot is empty. Raffle is invalid");
        require(winner == address(0), "A winner has already been selected");

        winner = pickRandomWinner();
        // Divide into parts
        uint halfOfPot = prizePool();
        uint donation = donationAmount();
        uint commision = (pot - halfOfPot) - donation;
        // Send to the winner
        token.transfer(winner, halfOfPot);
        // Send to the charity address
        token.transfer(donationAddress, donation);
        // Get the commision
        token.transfer(owner, commision);

        return winner;
    }
}
