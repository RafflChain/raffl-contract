// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Raffle contract to start a raffle with as many users as possible
/// @author @Bullrich
/// @notice Only the deployer of the contract can finish the raffle
/// @custom:security-contact info+security@rafflchain.com
contract Raffle is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// Different type of the bundles. Used for specifying a purchase
    enum BundleSize {
        Small,
        Medium,
        Large
    }

    /// Triggered when user wants to interact with a finished raffle
    error RaffleOver();
    /// Triggered when the owner is trying to participate in its own raffle
    error OwnerCannotParticipate();
    /// Triggered when the purchase number or type is invalid
    error InvalidPurchase();
    /// Triggered on lack of funds for the selected bundle
    error InsufficientFunds();
    /// User tried to refer an address that is himself or someone who is not playing
    error InvalidReferral(string);
    /// User tried to claim the free ticket more than one
    error FreeTicketClaimed();
    /// There was a problem while finishing the Raffle
    error ErrorFinishing(string);
    /// There was a problem while transfering funds on the finished raffle
    error TransferFailed(uint, address);

    /// Set with all the players participating. Each user has tickets
    EnumerableSet.AddressSet private players;
    /// Tickets each player owns
    mapping(address => uint) public tickets;

    /// Emitted when the raffle is over
    event WinnerPicked(address winner);

    /// Emitted when a user is referred
    event Referred(address referral);

    /// Timestamp of when the raffle ends
    uint public immutable raffleEndDate;

    /// The fixed prize that will be given to the winner
    /// @dev This is if that amount gets reached, if not the pot is split in half
    uint public immutable fixedPrize;

    /// Address of the winner
    /// @dev this value is set up only after the raffle end
    address public winner;

    /// Container of ticket information.
    struct Bundle {
        uint amount;
        uint price;
    }

    /// Size of the small bundle
    uint16 public constant SMALL_BUNDLE_AMOUNT = 45;
    /// Price of the small bundle
    uint public immutable smallBundlePrice;
    /// Size of the medium bundle
    uint16 public constant MEDIUM_BUNDLE_AMOUNT = 200;
    /// Price of the medium bundle
    /// @notice the final price should be discounted than buying the same amount of small bundles
    uint public immutable mediumBundlePrice;
    /// Size of the large bundle
    uint16 public constant LARGE_BUNDLE_AMOUNT = 660;
    /// Prize of the large bundle
    /// @notice the final price should be discounted than buying the same amount of small bundles
    uint public immutable largeBundlePrice;

    /// @param ticketPrice Price of each ticket (without the decimals)
    /// @param daysToEndDate Duration of the Raffle (in days)
    /// @param _fixedPrize the prize pool that we are aiming to reach. Exceding pot will go to charity
    constructor(uint ticketPrice, uint8 daysToEndDate, uint _fixedPrize) Ownable(msg.sender) {
        raffleEndDate = block.timestamp + (daysToEndDate * 1 days);
        fixedPrize = _fixedPrize;

        smallBundlePrice = ticketPrice;
        mediumBundlePrice = ticketPrice * 3;
        largeBundlePrice = ticketPrice * 5;
    }

    /// Utility method used to buy any given amount of tickets
    /// @param sizeOfBundle the number of tickets that will be purchased
    /// @param priceOfBundle the amount to pay for the bundle
    function buyCollectionOfTickets(uint sizeOfBundle, uint priceOfBundle) private returns (uint) {
        if (block.timestamp > raffleEndDate) revert RaffleOver();
        if (!(sizeOfBundle > 0 && priceOfBundle > 0)) revert InvalidPurchase();
        if (msg.sender == owner()) revert OwnerCannotParticipate();
        if (msg.value < priceOfBundle) revert InsufficientFunds();

        players.add(msg.sender);
        uint playerTickets = tickets[msg.sender];
        tickets[msg.sender] = playerTickets + sizeOfBundle;

        return sizeOfBundle;
    }

    /// Gives a ticket to a user who refered this player
    /// @param referral address of the user to give the referal bonus
    /// @dev the referring user must have own a ticket, proving that they are real accounts
    function addReferral(address referral) private {
        if (referral == msg.sender) revert InvalidReferral("Referring themselves");
        if (!players.contains(referral)) revert InvalidReferral("Not a player");
        tickets[referral] += 1;

        emit Referred(referral);
    }

    /// Buy a bundle of tickets and refer a user
    /// @param size of the bundle
    /// @param referral Address to give a referral ticket on purchaser
    function buyTicketBundleWithReferral(BundleSize size, address referral) external payable returns (uint) {
        uint receipt = buyTicketBundle(size);

        addReferral(referral);
        return receipt;
    }

    /// Buy a bundle of tickets
    /// @param size of the bundle
    function buyTicketBundle(BundleSize size) public payable returns (uint) {
        if (size == BundleSize.Small) {
            return buyCollectionOfTickets(SMALL_BUNDLE_AMOUNT, smallBundlePrice);
        } else if (size == BundleSize.Medium) {
            return buyCollectionOfTickets(MEDIUM_BUNDLE_AMOUNT, mediumBundlePrice);
        } else if (size == BundleSize.Large) {
            return buyCollectionOfTickets(LARGE_BUNDLE_AMOUNT, largeBundlePrice);
        } else {
            revert InsufficientFunds();
        }
    }

    /// Fallback function for when ethers is transfered randomly to this contract
    receive() external payable {
        if (msg.sender == owner()) revert OwnerCannotParticipate();
        if (block.timestamp > raffleEndDate) revert RaffleOver();

        if (msg.value >= largeBundlePrice) {
            buyCollectionOfTickets(LARGE_BUNDLE_AMOUNT, msg.value);
        } else if (msg.value >= mediumBundlePrice) {
            buyCollectionOfTickets(MEDIUM_BUNDLE_AMOUNT, msg.value);
        } else if (msg.value >= smallBundlePrice) {
            buyCollectionOfTickets(SMALL_BUNDLE_AMOUNT, msg.value);
        } else {
            revert InsufficientFunds();
        }
    }

    /// Returns all the available bundles sorted from smaller to bigger
    function getBundles() external view returns (Bundle[] memory) {
        Bundle[] memory bundles = new Bundle[](3);
        bundles[0] = Bundle(SMALL_BUNDLE_AMOUNT, smallBundlePrice);
        bundles[1] = Bundle(MEDIUM_BUNDLE_AMOUNT, mediumBundlePrice);
        bundles[2] = Bundle(LARGE_BUNDLE_AMOUNT, largeBundlePrice);

        return bundles;
    }

    /// User obtains a free ticket
    /// @notice only the fist ticket is free
    function getFreeTicket() external returns (uint) {
        if (players.contains(msg.sender)) revert FreeTicketClaimed();
        if (msg.sender == owner()) revert OwnerCannotParticipate();
        players.add(msg.sender);
        tickets[msg.sender] = 1;

        return 1;
    }

    /// Calculate the total number of tickets
    /// @notice Can only be invoked by the contract owner
    function listSoldTickets() public view onlyOwner returns (uint256) {
        uint ticketsSold = 0;
        for (uint256 i = 0; i < players.length(); i++) {
            ticketsSold += tickets[players.at(i)];
        }
        return ticketsSold;
    }

    /// Picks a random winner using a weighted algorithm
    /// @notice the algorithm randomness can be predicted if triggered automatically, better to do it manually
    function pickRandomWinner() private view returns (address) {
        uint totalTickets = listSoldTickets();
        if (totalTickets == 0) revert ErrorFinishing("No players");

        // Generate a pseudo-random number based on block variables
        uint randomNumber = uint(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, block.number))) %
            totalTickets;

        uint cumulativeSum = 0;
        // Iterate over players to find the winner
        for (uint i = 0; i < players.length(); i++) {
            cumulativeSum += tickets[players.at(i)];
            if (randomNumber < cumulativeSum) {
                return players.at(i);
            }
        }
        // This case should never occur if the function is implemented correctly
        revert ErrorFinishing("Unknown");
    }

    /// See how the prize would be distributed between end users
    /// @return prize that will go to the winner.
    /// Usually it's s fixedPrize but if that amount is not reached, then it's half of the pot.
    /// @return donation amount. It's 75% of the remaining pot.
    /// @return commission that will go to the contract owner.
    function prizeDistribution() public view returns (uint, uint, uint) {
        uint prize = prizePool();
        uint remainingPool = address(this).balance - prize;

        uint donation = (remainingPool * 75) / 100;
        uint commission = remainingPool - donation;
        return (prize, donation, commission);
    }

    /// See what would be the prize pool with the current treasury
    function prizePool() public view returns (uint) {
        if (address(this).balance > fixedPrize) {
            return fixedPrize;
        }
        return address(this).balance / 2;
    }

    /// Method used to finish a raffle
    /// @param donationAddress Address of the charity that will receive the tokens
    /// @notice Can only be called by the owner after the timestamp of the raffle has been reached
    function finishRaffle(address payable donationAddress) external onlyOwner returns (address) {
        if (block.timestamp < raffleEndDate) revert RaffleOver();
        if (winner != address(0)) revert RaffleOver();

        winner = pickRandomWinner();

        emit WinnerPicked(winner);

        // Divide into parts
        (uint prize, uint donation, uint commission) = prizeDistribution();
        // Send to the winner
        (bool successWinner, ) = payable(winner).call{value: prize}("");
        if (!successWinner) revert TransferFailed(prize, winner);
        // Send to the charity address
        (bool successDonation, ) = donationAddress.call{value: donation}("");
        if (!successDonation) revert TransferFailed(donation, donationAddress);
        // Get the commision
        (bool successOwner, ) = payable(owner()).call{value: commission}("");
        if (!successOwner) revert TransferFailed(commission, owner());

        return winner;
    }
}
