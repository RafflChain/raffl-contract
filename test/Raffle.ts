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
    const ticketPrice = hre.ethers.parseUnits("0.005", "ether");
    const prize = hre.ethers.parseUnits("3", "ether");
    const unlockDays = 2;

    // Contracts are deployed using the first signer/account by default
    const signers = await hre.ethers.getSigners();
    const [owner] = signers;
    const players = signers.slice(2);

    const Raffle = await hre.ethers.getContractFactory("Raffle");
    const raffle = await Raffle.deploy(ticketPrice, 2, prize);

    return {
      raffle,
      unlockDays,
      ticketPrice: ticketPrice,
      owner,
      players,
      prize,
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
      const Raffle = await hre.ethers.getContractFactory("Raffle");
      await expect(Raffle.deploy(10, 0, 100)).to.rejectedWith(
        "Future timestamp must be at least 1 day",
      );
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
      purchase: (
        contract: Raffle,
        value: bigint,
        referral?: string,
      ) => Promise<ContractTransactionResponse>;
    }[] = [
      {
        amount: SMALL_BUNDLE_AMOUNT,
        multiplier: 1n,
        purchase: (raffle, value, referral) =>
          referral
            ? raffle.buySmallTicketBundleWithReferral(referral, { value })
            : raffle.buySmallTicketBundle({ value }),
      },
      {
        amount: MEDIUM_BUNDLE_AMOUNT,
        multiplier: PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        purchase: (raffle, value, referral) =>
          referral
            ? raffle.buyMediumTicketBundleWithReferral(referral, { value })
            : raffle.buyMediumTicketBundle({ value }),
      },
      {
        amount: LARGE_BUNDLE_AMOUNT,
        multiplier: PRICE_LARGE_BUNDLE_MULTIPLIER,
        purchase: (raffle, value, referral) =>
          referral
            ? raffle.buyLargeTicketBundleWithReferral(referral, { value })
            : raffle.buyLargeTicketBundle({ value }),
      },
    ];

    conditions.forEach(({ amount, multiplier, purchase }) => {
      describe(`${amount} ticket(s)`, () => {
        it(`Should buy ${amount} ticket(s)`, async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          await expect(
            purchase(raffle.connect(player), ticketPrice * multiplier),
          ).to.changeEtherBalance(player.address, -ticketPrice * multiplier);
          expect(await raffle.connect(player).tickets(player)).to.equal(amount);
        });

        it(`Should change player's balance when buying ${amount} ticket(s)`, async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          await expect(
            purchase(raffle.connect(player), ticketPrice * multiplier),
          ).to.changeEtherBalances(
            [player, raffle],
            [-ticketPrice * multiplier, ticketPrice * multiplier],
          );
          expect(await raffle.connect(player).tickets(player)).to.equal(amount);
        });

        it("Should fail if it does not send enough ethers", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          await expect(purchase(raffle.connect(player), 1n)).to.be.rejectedWith(
            "Insufficient funds",
          );
        });

        it("Should report how many tickets the user has", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player] = players;
          const playerRaffle = raffle.connect(player);
          // Buy 1 ticket and verify that the player has 1 ticket
          await playerRaffle.buySmallTicketBundle({ value: ticketPrice });
          const smallBundle = await raffle.smallBundle();
          expect(await playerRaffle.tickets(player)).to.equal(
            smallBundle.amount,
          );
          // Buy more tickets and verify that the player now has amount + 1 tickets
          await purchase(playerRaffle, ticketPrice * multiplier);
          expect(await playerRaffle.tickets(player)).to.equal(
            BigInt(amount) + smallBundle.amount,
          );
        });

        it("Should reflect the amount of tickets each user has", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player1, player2] = players;
          // Aprove 2 tickets
          await purchase(raffle.connect(player1), ticketPrice * multiplier);
          expect(await raffle.connect(player1).tickets(player1)).to.equal(
            amount,
          );

          // Aprove 1 tickets
          const rafflePlayer2 = raffle.connect(player2);
          await rafflePlayer2.buySmallTicketBundle({
            value: ticketPrice * multiplier,
          });
          await rafflePlayer2.buySmallTicketBundle({
            value: ticketPrice * multiplier,
          });
          await rafflePlayer2.buySmallTicketBundle({
            value: ticketPrice * multiplier,
          });
          expect(await rafflePlayer2.tickets(player2)).to.equal(
            SMALL_BUNDLE_AMOUNT * 3n,
          );
        });

        it("Should fail if the raffle end date has been reached", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          await time.increaseTo(generateDateInTheFuture(10));
          await expect(
            purchase(raffle.connect(players[0]), ticketPrice * multiplier),
          ).to.be.rejectedWith("Raffle is over");
        });

        it("Should increment the pot when more people buy tickets", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player1, player2] = players;
          expect(await raffle.pot()).to.equal(0);
          const rAddress = await raffle.getAddress();
          await expect(
            purchase(raffle.connect(player1), ticketPrice * multiplier),
          ).to.changeEtherBalance(player1, -ticketPrice * multiplier);
          expect(await raffle.pot()).to.equal(ticketPrice * multiplier);
          await expect(
            purchase(raffle.connect(player2), ticketPrice * multiplier),
          ).to.changeEtherBalance(player2, -ticketPrice * multiplier);
          expect(await raffle.pot()).to.equal(ticketPrice * 2n * multiplier);
          expect(await hre.ethers.provider.getBalance(rAddress)).to.equal(
            ticketPrice * 2n * multiplier,
          );
        });

        it("Should increment the tickets sold when more people buy tickets", async () => {
          const { raffle, owner, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);
          const [player1, player2] = players;
          expect(await raffle.pot()).to.equal(0);
          const rAddress = await raffle.getAddress();
          await expect(
            purchase(raffle.connect(player1), ticketPrice * multiplier),
          ).to.changeEtherBalance(player1, -ticketPrice * multiplier);
          expect(await raffle.connect(owner).listSoldTickets()).to.equal(
            amount,
          );
          await expect(
            purchase(raffle.connect(player2), ticketPrice * multiplier),
          ).to.changeEtherBalances(
            [player2, raffle],
            [-ticketPrice * multiplier, ticketPrice * multiplier],
          );
          expect(await raffle.connect(owner).listSoldTickets()).to.equal(
            amount * 2n,
          );
        });

        it("Should not allow owner to participate in the Raffle", async () => {
          const { raffle, owner } = await loadFixture(deployRaffleFixture);
          await expect(purchase(raffle.connect(owner), 0n)).to.be.rejectedWith(
            "Owner cannot participate in the Raffle",
          );
        });

        it("Should not allow to buy a free tickets after purchasing tickets", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);

          const [player] = players;
          await purchase(raffle.connect(player), ticketPrice * multiplier);

          await expect(
            raffle.connect(player).getFreeTicket(),
          ).to.be.rejectedWith("User already owns tickets");
        });

        it("Should give one ticket to referral", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);

          const [player, referral] = players;
          // We made the referral into a player
          await raffle.connect(referral).getFreeTicket();

          // We purchase the ticket with the referral
          await purchase(
            raffle.connect(player),
            ticketPrice * multiplier,
            referral.address,
          );

          // Should own free ticket + referral ticket
          expect(await raffle.connect(referral).tickets(referral)).to.equal(2);
        });

        it("Should emit event on referral", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);

          const [player, referral] = players;
          // We made the referral into a player
          await raffle.connect(referral).getFreeTicket();

          // We purchase the ticket with the referral
          const tx = await purchase(
            raffle.connect(player),
            ticketPrice * multiplier,
            referral.address,
          );

          await expect(tx).to.emit(raffle, "Referred").withArgs(referral);
        });

        it("Should not let user refer itself", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);

          const [player] = players;

          await expect(
            purchase(
              raffle.connect(player),
              ticketPrice * multiplier,
              player.address,
            ),
          ).to.be.rejectedWith("User can not refer themselves");
        });

        it("Should not let refer users who are not playing", async () => {
          const { raffle, players, ticketPrice } =
            await loadFixture(deployRaffleFixture);

          const [player, referral] = players;

          await expect(
            purchase(
              raffle.connect(player),
              ticketPrice * multiplier,
              referral.address,
            ),
          ).to.be.rejectedWith("Can only refer a user who owns a ticket");
        });
      });
    });

    describe("Fallback function", () => {
      it("Should buy a small bundle with the fallback function", async () => {
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;

        // Send the amount for a small ticket bundle
        await player.sendTransaction({ to: raffle, value: ticketPrice });
        expect(await raffle.tickets(player)).to.equal(SMALL_BUNDLE_AMOUNT);
      });

      it("Should buy a medium bundle with the fallback function", async () => {
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;

        // Send the amount for a medium ticket bundle
        await player.sendTransaction({
          to: raffle,
          value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        });
        expect(await raffle.tickets(player)).to.equal(MEDIUM_BUNDLE_AMOUNT);
      });

      it("Should buy a large bundle with the fallback function", async () => {
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;

        // Send the amount for a large ticket bundle
        const tx = await player.sendTransaction({
          to: raffle,
          value: ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER,
        });

        expect(await raffle.tickets(player)).to.equal(LARGE_BUNDLE_AMOUNT);
      });

      it("Should fail if owner send eth", async () => {
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);

        await expect(
          owner.sendTransaction({
            to: raffle,
            value: ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER,
          }),
        ).to.rejectedWith("Owner cannot participate in the Raffle");
      });

      it("Should fail if too little eth got sent", async () => {
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;

        await expect(
          player.sendTransaction({ to: raffle, value: ticketPrice / 2n }),
        ).to.rejectedWith("Incorrect payment amount");
      });
    });
  });

  describe("Prize", () => {
    let raffleInstance: Raffle;
    let price: bigint;

    beforeEach(async () => {
      const { raffle, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      price = ticketPrice;
      const [player] = players;
      expect(await raffle.pot()).to.equal(0);
      await raffle.connect(player).buyMediumTicketBundle({
        value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      });
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
        ((price * PRICE_MEDIUM_BUNDLE_MULTIPLIER) / 2n / 100n) * 25n;
      const [_, donation] = await raffleInstance.prizeDistribution();
      expect(donation).to.equal(
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
      const { raffle, owner, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await raffle.connect(player).buyMediumTicketBundle({
        value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      });
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER);

      time.increaseTo(generateDateInTheFuture(10));
      await expect(
        raffle.connect(owner).finishRaffle(random),
      ).to.changeEtherBalance(player, pot / 2n);
    });

    it("Should distribute half of the pot to the donation campaign (minus comission)", async () => {
      const { raffle, owner, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, donation] = players;
      await raffle.connect(player).buyMediumTicketBundle({
        value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      });
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER);

      time.increaseTo(generateDateInTheFuture(10));
      const commission = (pot / 2n / 100n) * 25n;
      await expect(
        raffle.connect(owner).finishRaffle(donation),
      ).to.changeEtherBalance(donation, pot / 2n - commission);
    });

    it("Should distribute the pot between winner, donation campaign and comission", async () => {
      const { raffle, owner, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, donation] = players;
      await raffle.connect(player).buyLargeTicketBundle({
        value: ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER,
      });
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER);

      time.increaseTo(generateDateInTheFuture(10));
      const comission = (pot / 2n / 100n) * 25n;
      await expect(
        raffle.connect(owner).finishRaffle(donation),
      ).to.changeEtherBalances(
        [player, donation, owner],
        [pot / 2n, pot / 2n - comission, comission],
      );
    });

    it("Should define a winner", async () => {
      const { raffle, owner, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await raffle.connect(player).buyMediumTicketBundle({
        value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      });
      const pot = await raffle.pot();

      time.increaseTo(generateDateInTheFuture(10));
      await expect(
        raffle.connect(owner).finishRaffle(random),
      ).to.changeEtherBalance(player, pot / 2n);

      expect(await raffle.winner()).to.equal(player.address);
    });

    it("Should set winner's parameter and event to the same", async () => {
      const { raffle, owner, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await raffle.connect(player).buyMediumTicketBundle({
        value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      });

      time.increaseTo(generateDateInTheFuture(5));
      const winnerTx = await raffle.connect(owner).finishRaffle(random);

      await expect(winnerTx)
        .to.emit(raffle, "WinnerPicked")
        .withArgs(await raffle.winner());
    });

    it("Should not be able to be invoked once a winner was decided", async () => {
      const { raffle, owner, players, ticketPrice } =
        await loadFixture(deployRaffleFixture);
      const [player, random] = players;
      await raffle.connect(player).buyMediumTicketBundle({
        value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
      });
      const pot = await raffle.pot();

      time.increaseTo(generateDateInTheFuture(10));
      await expect(
        raffle.connect(owner).finishRaffle(random),
      ).to.changeEtherBalance(player, pot / 2n);

      expect(await raffle.winner()).to.equal(player.address);

      await expect(raffle.connect(owner).finishRaffle(random)).to.rejectedWith(
        "A winner has already been selected",
      );
    });

    describe("Prize distribution", () => {
      it("Should give only prize if amount is exceeded", async () => {
        const { raffle, owner, players, ticketPrice, prize } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;

        await player.sendTransaction({ to: raffle, value: prize * 5n });
        const pot = await raffle.pot();
        expect(pot).to.be.greaterThan(await raffle.prizePool());
      });

      it("Should give half of pot if prize amount is not reached", async () => {
        const { raffle, owner, players, ticketPrice, prize } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;

        await raffle.connect(player).buyMediumTicketBundle({
          value: ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER,
        });
        const pot = await raffle.pot();
        expect(await raffle.prizePool()).to.be.equal(pot / 2n);
      });

      it("Should divide the pot between winner, donation campaign and comission with an unfulfilled prize", async () => {
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player, donation] = players;
        await raffle.connect(player).buyLargeTicketBundle({
          value: ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER,
        });
        const pot = await raffle.pot();
        expect(pot).to.equal(ticketPrice * PRICE_LARGE_BUNDLE_MULTIPLIER);

        time.increaseTo(generateDateInTheFuture(10));
        const comission = (pot / 2n / 100n) * 25n;
        await expect(
          raffle.connect(owner).finishRaffle(donation),
        ).to.changeEtherBalances(
          [player, donation, owner],
          [pot / 2n, pot / 2n - comission, comission],
        );
      });

      it("Should divide the pot between winner, donation campaign and comission with a complete prize", async () => {
        const { raffle, owner, players, ticketPrice, prize } =
          await loadFixture(deployRaffleFixture);
        const [player, donation] = players;
        await player.sendTransaction({ to: raffle, value: prize * 5n });
        const pot = await raffle.pot();
        expect(pot).to.equal(prize * 5n);

        time.increaseTo(generateDateInTheFuture(10));
        const comission = ((pot - prize) / 100n) * 25n;
        await expect(
          raffle.connect(owner).finishRaffle(donation),
        ).to.changeEtherBalances(
          [player, donation, owner],
          [prize, pot - prize - comission, comission],
        );
      });
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
        const { raffle, owner, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player1, player2, player3] = players;
        // Players buy tickets

        const ticketCost = ticketPrice * PRICE_MEDIUM_BUNDLE_MULTIPLIER;

        // Player 1
        await raffle
          .connect(player1)
          .buyMediumTicketBundle({ value: ticketCost }); // 1 bundle

        // Player 2

        await raffle
          .connect(player2)
          .buyMediumTicketBundle({ value: ticketCost }); // 1 bundle
        await raffle
          .connect(player2)
          .buyMediumTicketBundle({ value: ticketCost }); // Total 2 bundles
        await raffle
          .connect(player2)
          .buyMediumTicketBundle({ value: ticketCost }); // Total 3 bundles

        // Player 3
        await raffle
          .connect(player3)
          .buyMediumTicketBundle({ value: ticketCost }); // 1 bundle

        // Simulate new block for randomness
        await hre.network.provider.send("evm_increaseTime", [
          Math.floor(Math.random() * 100),
        ]);
        await hre.network.provider.send("evm_mine");

        time.increaseTo(
          generateDateInTheFuture(Math.floor(Math.random() * 100) + 3),
        );

        let winnerTx = await raffle.connect(owner).finishRaffle(owner);

        const winnerReceipt = await winnerTx.wait();

        const winnerEvent = winnerReceipt?.logs
          .map((log) => {
            return raffle.interface.parseLog(log);
          })
          .find((event) => event && event.name === "WinnerPicked");

        const winner = winnerEvent?.args.winner;

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
