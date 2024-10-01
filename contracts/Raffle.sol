// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title Raffle contract to start a raffle with as many users as possible
/// @author @Bullrich
/// @notice Only the deployer of the contract can finish the raffle
/// @custom:security-contact info+security@rafflchain.com
contract Raffle {
    /// Array with all the players participating. Each user has tickets
    address[] private players;
    /// Tickets each player owns
    mapping(address => uint) public tickets;

    /// Mapping used to ensure that we don't have duplicate players
    mapping(address => bool) private isPlayer;

    /// Address of the deployer of the contract.
    /// @notice This is the user that can finalize the raffle and receives the commision
    address private immutable owner;
    /// Timestamp of when the raffle ends
    uint public immutable raffleEndDate;
    /// Total amount of the tokens in the contract
    uint public pot;
    /// Token used in the contract as the currency
    IERC20Metadata public immutable token;

    /// Address of the winner
    /// @dev this value is set up only after the raffle end
    address public winner;

    /// Container of ticket information.
    struct Bundle {
        uint amount;
        uint price;
    }

    /// Price and amount of the small bundle
    Bundle public smallBundle;
    /// Price and amount of the medium bundle
    /// @notice the final price should be discounted than buying the same amount of small bundles
    Bundle public mediumBundle;
    /// Price and amount of the big bundle
    /// @notice the final price should be discounted than buying the same amount of small bundles
    Bundle public largeBundle;

    /// @param _ticketPrice Price of each ticket (without the decimals)
    /// @param daysToEndDate Duration of the Raffle (in days)
    /// @param _token Address of the ERC20 token that will be used in the Raffle
    constructor(uint _ticketPrice, uint8 daysToEndDate, IERC20Metadata _token) {
        raffleEndDate = getFutureTimestamp(daysToEndDate);
        require(block.timestamp < raffleEndDate, "Unlock time should be in the future");
        owner = msg.sender;
        token = _token;
        uint ticketPrice = _ticketPrice * (10 ** token.decimals());

        smallBundle = Bundle(1, ticketPrice);
        mediumBundle = Bundle(10, ticketPrice * 8);
        largeBundle = Bundle(100, ticketPrice * 60);
    }

    /// Utility method used to buy any given amount of tickets
    /// @param bundle the bundle that will be purchased
    function buyCollectionOfTickets(Bundle memory bundle) private returns (uint) {
        require(block.timestamp < raffleEndDate, "Raffle is over");
        require(bundle.amount > 0, "Can not buy 0 tickets");
        require(msg.sender != owner, "Owner cannot participate in the Raffle");
        require(token.balanceOf(msg.sender) >= bundle.price, "Insufficient funds");
        require(token.allowance(msg.sender, address(this)) >= bundle.price, "Insufficient Allowance");

        token.transferFrom(msg.sender, address(this), bundle.price);
        pot += bundle.price;
        uint playerTickets = tickets[msg.sender];
        if (!isPlayer[msg.sender]) {
            isPlayer[msg.sender] = true;
            players.push(msg.sender);
        }
        tickets[msg.sender] = playerTickets + bundle.amount;
        return bundle.amount;
    }

    /// Buy an individual ticket
    function buySmallTicketBundle() public returns (uint) {
        return buyCollectionOfTickets(smallBundle);
    }

    /// Buy a collection of 10 tickets
    function buyMediumTicketBundle() public returns (uint) {
        return buyCollectionOfTickets(mediumBundle);
    }

    /// Buy a collection of 100 tickets
    function buyLargeTicketBundle() public returns (uint) {
        return buyCollectionOfTickets(largeBundle);
    }

    /// Returns all the available bundles sorted from smaller to bigger
    function getBundles() public view returns (Bundle[] memory) {
        Bundle[] memory bundles = new Bundle[](3);
        bundles[0] = smallBundle;
        bundles[1] = mediumBundle;
        bundles[2] = largeBundle;
        return bundles;
    }

    /// User obtains a free ticket
    /// @notice only the fist ticket is free
    function getFreeTicket() public returns (uint) {
        require(!isPlayer[msg.sender], "User already owns tickets");
        require(msg.sender != owner, "Owner can not participate in the Raffle");

        isPlayer[msg.sender] = true;
        players.push(msg.sender);
        tickets[msg.sender] = 1;

        return 1;
    }

    /// Function to calculate the timestamp X days from now
    function getFutureTimestamp(uint8 daysFromNow) private view returns (uint256) {
        require(daysFromNow > 0, "Future timestamp must be at least 1 day");
        // Convert days to seconds
        uint256 futureTimestamp = block.timestamp + (daysFromNow * 1 days);
        return futureTimestamp;
    }

    /// Calculate the total number of tickets
    /// @notice Can only be invoked by the contract owner
    function listSoldTickets() public view returns (uint256) {
        require(msg.sender == owner, "Invoker must be the owner");
        uint ticketsSold = 0;
        for (uint256 i = 0; i < players.length; i++) {
            ticketsSold += tickets[players[i]];
        }
        return ticketsSold;
    }

    /// Picks a random winner using a weighted algorithm
    /// @notice the algorithm randomness can be predicted if triggered automatically, better to do it manually
    function pickRandomWinner() private view returns (address) {
        uint totalTickets = listSoldTickets();
        require(totalTickets > 0, "No tickets sold");

        // Generate a pseudo-random number based on block variables
        uint randomNumber = uint(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, block.number))) %
            totalTickets;

        uint cumulativeSum = 0;
        // Iterate over players to find the winner
        for (uint i = 0; i < players.length; i++) {
            cumulativeSum += tickets[players[i]];
            if (randomNumber < cumulativeSum) {
                return players[i];
            }
        }
        // In case no winner is found (should not happen), return a default value
        return address(0);
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
