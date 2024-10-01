import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ContractTransactionResponse } from "ethers";
import hre from "hardhat";
import { Raffle } from "../typechain-types";

describe("Raffle", function () {
  const PRICE_MEDIUM_BUNDLE_MULTIPLIER = 3n;
  const PRICE_LARGE_BUNDLE_MULTIPLIER = 5n;

  const SMALL_BUNDLE_AMOUNT = 45n;
  const MEDIUM_BUNDLE_AMOUNT = 200n;
  const LARGE_BUNDLE_AMOUNT = 660n;

  async function deployRaffleFixture() {
    const ticketPrice = 2n;
    const unlockDays = 2;

    // Contracts are deployed using the first signer/account by default
    const signers = await hre.ethers.getSigners();
    const [owner] = signers;
    const players = signers.slice(2);

    const DemoToken = await hre.ethers.getContractFactory("RaffleToken");
    const token = await DemoToken.deploy();
    const tokenAddress = await token.getAddress();

    const decimals: bigint = await token.decimals();
    for (let i = 0; i < 5; i++) {
      const transferAmount = ticketPrice * 10n ** decimals * 100n;
      await token.connect(owner).transfer(players[i].address, transferAmount);
    }

    const Raffle = await hre.ethers.getContractFactory("Raffle");
    const raffle = await Raffle.deploy(ticketPrice, 2, tokenAddress);

    return {
      raffle,
      unlockDays,
      ticketPrice: ticketPrice * 10n ** decimals,
      owner,
      players,
      token,
    };
  }

  function generateDateInTheFuture(daysFromNow: number): bigint {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return BigInt(Math.round(date.valueOf() / 1000));
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { raffle, unlockDays } = await loadFixture(deployRaffleFixture);
      const endDate = await raffle.raffleEndDate();

      const twoDaysFromNow = generateDateInTheFuture(unlockDays);

      // Remove the seconds to ensure they are in the same hour
      expect(endDate).to.closeTo(twoDaysFromNow, 100);
    });

    it("Should fail if the deployment time is not in the future", async () => {
      const { token } = await loadFixture(deployRaffleFixture);
      const Raffle = await hre.ethers.getContractFactory("Raffle");
      await expect(Raffle.deploy(10, 0, token)).to.rejectedWith(
        "Future timestamp must be at least 1 day",
      );
    });

    it("Should set the token address", async () => {
      const { raffle, token } = await loadFixture(deployRaffleFixture);
      expect(await raffle.token()).to.equal(await token.getAddress());
    });

    it("Should set the correct small ticket bundle", async () => {
      const { raffle, ticketPrice } = await loadFixture(deployRaffleFixture);
      const bundle = await raffle.smallBundle();
      expect(bundle.amount).to.equal(SMALL_BUNDLE_AMOUNT);
      expect(bundle.price).to.equal(ticketPrice);
    });

    it("Should set the correct medium ticket bundle", async () => {
      const { raffle, ticketPrice } = await loadFixture(deployRaffleFixture);
      const bundle = await raffle.mediumBundle();

      expect(bundle.price).to.equal(
        ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      );
      expect(bundle.amount).to.equal(MEDIUM_BUNDLE_AMOUNT);
    });

    it("Should set the correct large ticket bundle", async () => {
      const { raffle, ticketPrice } = await loadFixture(deployRaffleFixture);
      const bundle = await raffle.largeBundle();

      expect(bundle.price).to.equal(
        ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER,
      );
      expect(bundle.amount).to.equal(LARGE_BUNDLE_AMOUNT);
    });

    it("Should set all the bundles correctly", async () => {
      const { raffle, ticketPrice } = await loadFixture(deployRaffleFixture);
      const [small, medium, large] = await raffle.getBundles();

      expect(small.amount).to.equal(SMALL_BUNDLE_AMOUNT);
      expect(small.price).to.equal(ticketPrice);

      expect(medium.price).to.equal(
        ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      );
      expect(medium.amount).to.equal(MEDIUM_BUNDLE_AMOUNT);

      expect(large.price).to.equal(ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER);
      expect(large.amount).to.equal(LARGE_BUNDLE_AMOUNT);
    });

    it("Should set the pot to 0", async () => {
      const { raffle, owner } = await loadFixture(deployRaffleFixture);
      expect(await raffle.pot()).to.equal(0);
    });

    it("Should set sold tickets to 0", async () => {
      const { raffle, owner } = await loadFixture(deployRaffleFixture);
      expect(await raffle.connect(owner).listSoldTickets()).to.equal(0);
    });

    it("Should not allow external users to see how many tickets are sold", async () => {
      const { raffle, players } = await loadFixture(deployRaffleFixture);
      await expect(
        raffle.connect(players[0]).listSoldTickets(),
      ).to.be.rejectedWith("Invoker must be the owner");
    });
  });

  describe("Buy tickets", () => {
    describe("Free ticket", () => {
      it("Should get a free ticket", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        const [player] = players;
        await raffle.connect(player).getFreeTicket();
        expect(await raffle.connect(player).tickets(player)).to.equal(1);
      });

      it("Should increase the ticket count", async () => {
        const { raffle, owner, players } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        await raffle.connect(player).getFreeTicket();
        expect(await raffle.connect(owner).listSoldTickets()).to.equal(1);
      });
    });

    const conditions: {
      amount: bigint;
      multiplier: bigint;
      purchase: (contract: Raffle) => Promise<ContractTransactionResponse>;
    }[] = [
      {
        amount: SMALL_BUNDLE_AMOUNT,
        multiplier: 1n,
        purchase: (raffle) => raffle.buySmallTicketBundle(),
      },
      {
        amount: MEDIUM_BUNDLE_AMOUNT,
        multiplier: PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        purchase: (raffle) => raffle.buyMediumTicketBundle(),
      },
      {
        amount: LARGE_BUNDLE_AMOUNT,
        multiplier: PRICE_LARGE_BUNDLE_MULTIPLIER,
        purchase: (raffle) => raffle.buyLargeTicketBundle(),
      },
    ];

    conditions.forEach(({ amount, multiplier, purchase }) => {
      describe(`${amount} ticket(s)`, () => {
        it(`Should buy ${amount} ticket(s)`, async () => {
          const { raffle, token, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          await token
            .connect(player)
            .approve(await raffle.getAddress(), ticketPrice * multiplier);
          await expect(purchase(raffle.connect(player))).to.changeTokenBalance(
            token,
            player.address,
            -ticketPrice * multiplier,
          );
          expect(await raffle.connect(player).tickets(player)).to.equal(amount);
        });

        it(`Should change player's balance when buying ${amount} ticket(s)`, async () => {
          const { raffle, token, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          await token
            .connect(player)
            .approve(await raffle.getAddress(), ticketPrice * multiplier);
          await expect(purchase(raffle.connect(player))).to.changeTokenBalances(
            token,
            [player, raffle],
            [-ticketPrice * multiplier, ticketPrice * multiplier],
          );
          expect(await raffle.connect(player).tickets(player)).to.equal(amount);
        });

        it("Should fail if it does not have allowance", async () => {
          const { raffle, players } = await loadFixture(deployRaffleFixture);
          await expect(purchase(raffle.connect(players[0]))).to.be.rejectedWith(
            "Insufficient Allowance",
          );
        });

        it("Should fail if it does not have enough tokens", async () => {
          const { raffle, token, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player, rando] = players;
          // We transfer all the tokens out of the player before hand
          const playerBalance = await token
            .connect(player)
            .balanceOf(player.address);
          await token.connect(player).transfer(rando.address, playerBalance);
          await token
            .connect(player)
            .approve(await raffle.getAddress(), ticketPrice * 3n * multiplier);
          await expect(purchase(raffle.connect(players[0]))).to.be.rejectedWith(
            "Insufficient funds",
          );
        });

        it("Should report how many tickets the user has", async () => {
          const { raffle, token, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          const playerRaffle = raffle.connect(player);
          // Aprove 2 tickets
          await token
            .connect(player)
            .approve(await raffle.getAddress(), ticketPrice * 2n * multiplier);
          // Buy 1 ticket and verify that the player has 1 ticket
          await playerRaffle.buySmallTicketBundle();
          const smallBundle = await raffle.smallBundle();
          expect(await playerRaffle.tickets(player)).to.equal(
            smallBundle.amount,
          );
          // Buy more tickets and verify that the player now has amount + 1 tickets
          await purchase(playerRaffle);
          expect(await playerRaffle.tickets(player)).to.equal(
            BigInt(amount) + smallBundle.amount,
          );
        });

        it("Should reflect the amount of tickets each user has", async () => {
          const { raffle, token, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player1, player2] = players;
          // Aprove 2 tickets
          await token
            .connect(player1)
            .approve(await raffle.getAddress(), ticketPrice * multiplier);
          await purchase(raffle.connect(player1));
          expect(await raffle.connect(player1).tickets(player1)).to.equal(
            amount,
          );

          // Aprove 1 tickets
          const rafflePlayer2 = raffle.connect(player2);
          await token
            .connect(player2)
            .approve(await raffle.getAddress(), ticketPrice * 3n);
          await rafflePlayer2.buySmallTicketBundle();
          await rafflePlayer2.buySmallTicketBundle();
          await rafflePlayer2.buySmallTicketBundle();
          expect(await rafflePlayer2.tickets(player2)).to.equal(
            SMALL_BUNDLE_AMOUNT * 3n,
          );
        });

        it("Should fail if the raffle end date has been reached", async () => {
          const { raffle, players } = await loadFixture(deployRaffleFixture);
          await time.increaseTo(generateDateInTheFuture(10));
          await expect(purchase(raffle.connect(players[0]))).to.be.rejectedWith(
            "Raffle is over",
          );
        });

        it("Should increment the pot when more people buy tickets", async () => {
          const { raffle, token, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player1, player2] = players;
          expect(await raffle.pot()).to.equal(0);
          const rAddress = await raffle.getAddress();
          await token
            .connect(player1)
            .approve(rAddress, ticketPrice * multiplier);
          await expect(purchase(raffle.connect(player1))).to.changeTokenBalance(
            token,
            player1,
            -ticketPrice * multiplier,
          );
          expect(await raffle.pot()).to.equal(ticketPrice * multiplier);
          await token
            .connect(player2)
            .approve(rAddress, ticketPrice * multiplier);
          await expect(purchase(raffle.connect(player2))).to.changeTokenBalance(
            token,
            player2,
            -ticketPrice * multiplier,
          );
          expect(await raffle.pot()).to.equal(ticketPrice * 2n * multiplier);
          expect(await token.balanceOf(rAddress)).to.equal(
            ticketPrice * 2n * multiplier,
          );
        });

        it("Should increment the tickets sold when more people buy tickets", async () => {
          const { raffle, token, owner, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player1, player2] = players;
          expect(await raffle.pot()).to.equal(0);
          const rAddress = await raffle.getAddress();
          await token
            .connect(player1)
            .approve(rAddress, ticketPrice * multiplier);
          await expect(purchase(raffle.connect(player1))).to.changeTokenBalance(
            token,
            player1,
            -ticketPrice * multiplier,
          );
          expect(await raffle.connect(owner).listSoldTickets()).to.equal(
            amount,
          );
          await token
            .connect(player2)
            .approve(rAddress, ticketPrice * multiplier);
          await expect(purchase(raffle.connect(player2))).to.changeTokenBalance(
            token,
            player2,
            -ticketPrice * multiplier,
          );
          expect(await raffle.connect(owner).listSoldTickets()).to.equal(
            amount * 2n,
          );
        });

        it("Should not allow owner to participate in the Raffle", async () => {
          const { raffle, owner } = await loadFixture(deployRaffleFixture);
          await expect(purchase(raffle.connect(owner))).to.be.rejectedWith(
            "Owner cannot participate in the Raffle",
          );
        });

        it("Should not allow to buy a free tickets after purchasing tickets", async () => {
          const { raffle, players, token, ticketPrice } =
            await loadFixture(deployRaffleFixture);

          const [player] = players;
          await token
            .connect(player)
            .approve(await raffle.getAddress(), ticketPrice * multiplier);
          await purchase(raffle.connect(player));

          await expect(
            raffle.connect(player).getFreeTicket(),
          ).to.be.rejectedWith("User already owns tickets");
        });
      });
    });
  });

  describe("Prize", () => {
    let raffleInstance: Raffle;
    let price: bigint;

    beforeEach(async () => {
      const { raffle, token, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      price = ticketPrice;
      const [player] = players;
      expect(await raffle.pot()).to.equal(0);
      const rAddress = await raffle.getAddress();
      await token
        .connect(player)
        .approve(rAddress, ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER);
      await raffle.connect(player).buyMediumTicketBundle();
      raffleInstance = raffle;
    });

    it("Should show the correct pot size", async () => {
      expect(await raffleInstance.pot()).to.equal(
        price * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      );
    });

    it("Should show correct prize amount", async () => {
      expect(await raffleInstance.prizePool()).to.equal(
        (price * PRICE_MEDIUM_BUNDLE_MULTIPLIER) / 2n,
      );
    });

    it("Should show the correct donation amount", async () => {
      const commision =
        ((price * PRICE_MEDIUM_BUNDLE_MULTIPLIER) / 2n / 100n) * 5n;
      expect(await raffleInstance.donationAmount()).to.equal(
        (price * PRICE_MEDIUM_BUNDLE_MULTIPLIER) / 2n - commision,
      );
    });
  });

  describe("Finish Raffle", () => {
    it("Should fail if the owner is not closing the raffle", async () => {
      const { raffle, players } = await loadFixture(deployRaffleFixture);
      await expect(
        raffle.connect(players[0]).finishRaffle(players[0]),
      ).to.rejectedWith("Invoker must be the owner");
    });

    it("Should fail if the closing time has not being reached", async () => {
      const { raffle, owner } = await loadFixture(deployRaffleFixture);
      await expect(raffle.connect(owner).finishRaffle(owner)).to.rejectedWith(
        "End date has not being reached yet",
      );
    });

    it("Should fail if no tickets were purchased", async () => {
      const { raffle, owner } = await loadFixture(deployRaffleFixture);
      time.increaseTo(generateDateInTheFuture(10));
      await expect(raffle.connect(owner).finishRaffle(owner)).to.rejectedWith(
        "The pot is empty. Raffle is invalid",
      );
    });

    it("Should distribute half of the pot to the winner", async () => {
      const { raffle, owner, token, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await token
        .connect(player)
        .approve(
          await raffle.getAddress(),
          ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        );
      await raffle.connect(player).buyMediumTicketBundle();
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER);

      time.increaseTo(generateDateInTheFuture(10));
      await expect(
        raffle.connect(owner).finishRaffle(random),
      ).to.changeTokenBalance(token, player, pot / 2n);
    });

    it("Should distribute half of the pot to the donation campaign (minus comission)", async () => {
      const { raffle, owner, token, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, donation] = players;
      await token
        .connect(player)
        .approve(
          await raffle.getAddress(),
          ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        );
      await raffle.connect(player).buyMediumTicketBundle();
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER);

      time.increaseTo(generateDateInTheFuture(10));
      const comission = (pot / 2n / 100n) * 5n;
      await expect(
        raffle.connect(owner).finishRaffle(donation),
      ).to.changeTokenBalance(token, donation, pot / 2n - comission);
    });

    it("Should distribute the pot between winner, donation campaign and comission", async () => {
      const { raffle, owner, token, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, donation] = players;
      await token
        .connect(player)
        .approve(
          await raffle.getAddress(),
          ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER,
        );
      await raffle.connect(player).buyLargeTicketBundle();
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER);

      time.increaseTo(generateDateInTheFuture(10));
      const comission = (pot / 2n / 100n) * 5n;
      await expect(
        raffle.connect(owner).finishRaffle(donation),
      ).to.changeTokenBalances(
        token,
        [player, donation, owner],
        [pot / 2n, pot / 2n - comission, comission],
      );
    });

    it("Should define a winner", async () => {
      const { raffle, owner, token, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await token
        .connect(player)
        .approve(
          await raffle.getAddress(),
          ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        );
      await raffle.connect(player).buyMediumTicketBundle();
      const pot = await raffle.pot();

      time.increaseTo(generateDateInTheFuture(10));
      await expect(
        raffle.connect(owner).finishRaffle(random),
      ).to.changeTokenBalance(token, player, pot / 2n);

      expect(await raffle.winner()).to.equal(player.address);
    });

    it("Should not be able to be invoked once a winner was decided", async () => {
      const { raffle, owner, token, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await token
        .connect(player)
        .approve(
          await raffle.getAddress(),
          ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        );
      await raffle.connect(player).buyMediumTicketBundle();
      const pot = await raffle.pot();

      time.increaseTo(generateDateInTheFuture(10));
      await expect(
        raffle.connect(owner).finishRaffle(random),
      ).to.changeTokenBalance(token, player, pot / 2n);

      expect(await raffle.winner()).to.equal(player.address);

      await expect(raffle.connect(owner).finishRaffle(random)).to.rejectedWith(
        "A winner has already been selected",
      );
    });

    it("Should pick a winner based on weighted randomness", async function () {
      // Map to hold counts of wins
      let winnerCounts: { [playerNumber: number]: number } = {
        1: 0,
        2: 0,
        3: 0,
      };

      // Run pickWinner multiple times to check weighted randomness
      for (let i = 0; i < 500; i++) {
        const { raffle, owner, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player1, player2, player3] = players;
        // Players buy tickets

        const ticketCost = ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER;

        // Player 1
        await token
          .connect(player1)
          .approve(await raffle.getAddress(), ticketCost);
        await raffle.connect(player1).buyMediumTicketBundle(); // 1 ticket

        // Player 2
        await token
          .connect(player2)
          .approve(await raffle.getAddress(), ticketCost * 3n);
        await raffle.connect(player2).buyMediumTicketBundle(); // 1 ticket
        await raffle.connect(player2).buyMediumTicketBundle(); // Total 2 tickets
        await raffle.connect(player2).buyMediumTicketBundle(); // Total 3 tickets

        // Player 3
        await token
          .connect(player3)
          .approve(await raffle.getAddress(), ticketCost);
        await raffle.connect(player3).buyMediumTicketBundle(); // 1 ticket

        // Simulate new block for randomness
        await hre.network.provider.send("evm_increaseTime", [
          Math.floor(Math.random() * 100),
        ]);
        await hre.network.provider.send("evm_mine");

        time.increaseTo(
          generateDateInTheFuture(Math.floor(Math.random() * 100) + 3),
        );

        let winnerTx = await raffle.connect(owner).finishRaffle(owner);

        await winnerTx.wait();

        const winner = await raffle.winner();

        const winnerToPlayerNumber = (address: string): number => {
          switch (winner) {
            case player1.address:
              return 1;
            case player2.address:
              return 2;
            case player3.address:
              return 3;
            default:
              throw new Error("Out of bounds!");
          }
        };

        const winnerNumber = winnerToPlayerNumber(winner);

        winnerCounts[winnerNumber] += 1;
      }

      const results = JSON.stringify(winnerCounts);

      // player2 should win approximately twice as often as player1 and player3
      expect(winnerCounts[2]).to.be.greaterThan(
        winnerCounts[1],
        `Results: ${results}`,
      );
      expect(winnerCounts[2]).to.be.greaterThan(
        winnerCounts[3],
        `Results: ${results}`,
      );
    });
  });
});
