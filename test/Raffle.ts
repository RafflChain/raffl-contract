import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { Raffle } from "../typechain-types";

describe("Raffle", function () {
  const PRICE_10_TICKET_MULTIPLIER = 8n;
  const PRICE_100_TICKET_MULTIPLIER = 60n;

  async function deployRaffleFixture() {
    const ticketPrice = 5n;
    const unlockDays = 2;

    // Contracts are deployed using the first signer/account by default
    const signers = await hre.ethers.getSigners();
    const [owner] = signers;
    const players = signers.slice(2);

    const DemoToken = await hre.ethers.getContractFactory("DemoToken");
    const token = await DemoToken.deploy();
    const tokenAddress = await token.getAddress();

    const decimals: bigint = await token.decimals();
    for (const player of players) {
      const transferAmount = ticketPrice * 10n ** decimals * 100n;
      await token.connect(owner).transfer(player.address, transferAmount);
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

    it("Should set the correct ticket price", async () => {
      const { raffle, ticketPrice } = await loadFixture(deployRaffleFixture);
      expect(await raffle.ticketPrice()).to.equal(ticketPrice);
    });

    it("Should set the correct ticket prices", async () => {
      const { raffle, ticketPrice } = await loadFixture(deployRaffleFixture);
      expect(await raffle.price10Tickets()).to.equal(
        ticketPrice * PRICE_10_TICKET_MULTIPLIER,
      );
      expect(await raffle.price100Tickets()).to.equal(ticketPrice * 60n);
    });
  });

  describe("Buy tickets", () => {
    describe("Single ticket", () => {
      it("Should buy a single ticket", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        await token
          .connect(player)
          .approve(await raffle.getAddress(), ticketPrice);
        await expect(
          raffle.connect(player).buySingleTicket(),
        ).to.changeTokenBalance(token, player.address, -ticketPrice);
        expect(await raffle.countUserTickets()).to.equal(1);
      });

      it("Should change player's balance when buying a ticket", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        await token
          .connect(player)
          .approve(await raffle.getAddress(), ticketPrice);
        await expect(
          raffle.connect(player).buySingleTicket(),
        ).to.changeTokenBalances(
          token,
          [player, raffle],
          [-ticketPrice, ticketPrice],
        );
        expect(await raffle.countUserTickets()).to.equal(1);
      });

      it("Should fail if it does not have allowance", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        await expect(
          raffle.connect(players[0]).buySingleTicket(),
        ).to.rejectedWith("Insuficient Allowance");
      });

      it("Should fail if it does not have enough tokens", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player, rando] = players;
        // We transfer all the tokens out of the player before hand
        const playerBalance = await token.connect(player).balanceOf(player);
        await token.connect(player).transfer(rando.address, playerBalance);
        await token
          .connect(player)
          .approve(await raffle.getAddress(), ticketPrice * 3n);
        await expect(
          raffle.connect(players[0]).buySingleTicket(),
        ).to.rejectedWith("Insuficient funds");
      });

      it("Should report how many tickets the user has", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        // Aprove 2 tickets
        await token
          .connect(player)
          .approve(await raffle.getAddress(), ticketPrice * 2n);
        // Buy 1 ticket and verify that the player has 3
        await raffle.connect(player).buySingleTicket();
        expect(await raffle.countUserTickets()).to.equal(1);
        // Buy 1 more and verify that the player now has 2
        await raffle.connect(player).buySingleTicket();
        expect(await raffle.countUserTickets()).to.equal(2);
      });

      it("Should fail if the raffle end date has been reached", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        time.increaseTo(generateDateInTheFuture(10));
        await expect(
          raffle.connect(players[0]).buySingleTicket(),
        ).to.rejectedWith("Raffle is over");
      });

      it("Should increment the pot when more people buy tickets", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player1, player2] = players;
        expect(await raffle.pot()).to.equal(0);
        const rAddress = await raffle.getAddress();
        await token.connect(player1).approve(rAddress, ticketPrice);
        await expect(
          raffle.connect(player1).buySingleTicket(),
        ).to.changeTokenBalance(token, player1, -ticketPrice);
        expect(await raffle.pot()).to.equal(ticketPrice);
        await token.connect(player2).approve(rAddress, ticketPrice);
        await expect(
          raffle.connect(player2).buySingleTicket(),
        ).to.changeTokenBalance(token, player2, -ticketPrice);
        expect(await raffle.pot()).to.equal(ticketPrice * 2n);
        expect(await token.balanceOf(rAddress)).to.equal(ticketPrice * 2n);
      });
    });

    describe("10 tickets", () => {
      it("Should buy 10 tickets", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        await token
          .connect(player)
          .approve(
            await raffle.getAddress(),
            ticketPrice * PRICE_10_TICKET_MULTIPLIER,
          );
        await expect(
          raffle.connect(player).buy10Tickets(),
        ).to.changeTokenBalance(
          token,
          player.address,
          -ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
        expect(await raffle.countUserTickets()).to.equal(10);
      });

      it("Should change player's balance when buying 10 tickets", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        await token
          .connect(player)
          .approve(
            await raffle.getAddress(),
            ticketPrice * PRICE_10_TICKET_MULTIPLIER,
          );
        await expect(
          raffle.connect(player).buy10Tickets(),
        ).to.changeTokenBalances(
          token,
          [player, raffle],
          [
            -ticketPrice * PRICE_10_TICKET_MULTIPLIER,
            ticketPrice * PRICE_10_TICKET_MULTIPLIER,
          ],
        );
        expect(await raffle.countUserTickets()).to.equal(10);
      });

      it("Should fail if it does not have allowance", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        await expect(raffle.connect(players[0]).buy10Tickets()).to.rejectedWith(
          "Insuficient Allowance",
        );
      });

      it("Should fail if it does not have enough tokens", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player, rando] = players;
        // We transfer all the tokens out of the player before hand
        const playerBalance = await token.connect(player).balanceOf(player);
        await token.connect(player).transfer(rando.address, playerBalance);
        await token
          .connect(player)
          .approve(
            await raffle.getAddress(),
            ticketPrice * PRICE_10_TICKET_MULTIPLIER,
          );
        await expect(raffle.connect(players[0]).buy10Tickets()).to.rejectedWith(
          "Insuficient funds",
        );
      });

      it("Should report how many tickets the user has", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        // Aprove 2 tickets
        await token
          .connect(player)
          .approve(await raffle.getAddress(), ticketPrice * 9n);
        // Buy 1 ticket and verify that the player has 1
        await raffle.connect(player).buySingleTicket();
        expect(await raffle.countUserTickets()).to.equal(1);
        // Buy 10 more and verify that the player now has 11
        await raffle.connect(player).buy10Tickets();
        expect(await raffle.countUserTickets()).to.equal(11);
      });

      it("Should fail if the raffle end date has been reached", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        time.increaseTo(generateDateInTheFuture(10));
        await expect(raffle.connect(players[0]).buy10Tickets()).to.rejectedWith(
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
          .approve(rAddress, ticketPrice * PRICE_10_TICKET_MULTIPLIER);
        await expect(
          raffle.connect(player1).buy10Tickets(),
        ).to.changeTokenBalance(
          token,
          player1,
          -ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
        expect(await raffle.pot()).to.equal(
          ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );

        await token
          .connect(player2)
          .approve(rAddress, ticketPrice * PRICE_10_TICKET_MULTIPLIER);
        await expect(
          raffle.connect(player2).buy10Tickets(),
        ).to.changeTokenBalance(
          token,
          player2,
          -ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
        expect(await raffle.pot()).to.equal(ticketPrice * 16n);
        expect(await token.balanceOf(rAddress)).to.equal(ticketPrice * 16n);
      });
    });

    describe("100 tickets", () => {
      it("Should buy 100 tickets", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        await token
          .connect(player)
          .approve(
            await raffle.getAddress(),
            ticketPrice * PRICE_100_TICKET_MULTIPLIER,
          );
        await expect(
          raffle.connect(player).buy100Tickets(),
        ).to.changeTokenBalance(
          token,
          player.address,
          -ticketPrice * PRICE_100_TICKET_MULTIPLIER,
        );
        expect(await raffle.countUserTickets()).to.equal(100);
      });

      it("Should change player's balance when buying 100 tickets", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        const price100Tickets = ticketPrice * 60n;
        await token
          .connect(player)
          .approve(await raffle.getAddress(), price100Tickets);
        await expect(
          raffle.connect(player).buy100Tickets(),
        ).to.changeTokenBalances(
          token,
          [player, raffle],
          [-price100Tickets, price100Tickets],
        );
        expect(await raffle.countUserTickets()).to.equal(100);
      });

      it("Should fail if it does not have allowance", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        await expect(
          raffle.connect(players[0]).buy100Tickets(),
        ).to.rejectedWith("Insuficient Allowance");
      });

      it("Should fail if it does not have enough tokens", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player, rando] = players;
        // We transfer all the tokens out of the player before hand
        const playerBalance = await token.connect(player).balanceOf(player);
        await token.connect(player).transfer(rando.address, playerBalance);
        await token
          .connect(player)
          .approve(
            await raffle.getAddress(),
            ticketPrice * PRICE_100_TICKET_MULTIPLIER,
          );
        await expect(
          raffle.connect(players[0]).buy100Tickets(),
        ).to.rejectedWith("Insuficient funds");
      });

      it("Should report how many tickets the user has", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player] = players;
        // Aprove 2 tickets
        await token
          .connect(player)
          .approve(
            await raffle.getAddress(),
            ticketPrice *
              (PRICE_100_TICKET_MULTIPLIER + PRICE_10_TICKET_MULTIPLIER + 1n),
          );
        // Buy 1 ticket and verify that the player has 1
        await raffle.connect(player).buySingleTicket();
        expect(await raffle.countUserTickets()).to.equal(1);
        // Buy 10 more and verify that the player now has 11
        await raffle.connect(player).buy10Tickets();
        expect(await raffle.countUserTickets()).to.equal(11);
        // Buy 100 more and verify that the player now has 111
        await raffle.connect(player).buy100Tickets();
        expect(await raffle.countUserTickets()).to.equal(111);
      });

      it("Should fail if the raffle end date has been reached", async () => {
        const { raffle, players } = await loadFixture(deployRaffleFixture);
        time.increaseTo(generateDateInTheFuture(10));
        await expect(
          raffle.connect(players[0]).buy100Tickets(),
        ).to.rejectedWith("Raffle is over");
      });

      it("Should increment the pot when more people buy tickets", async () => {
        const { raffle, token, players, ticketPrice } =
          await loadFixture(deployRaffleFixture);
        const [player1, player2, player3] = players;
        expect(await raffle.pot()).to.equal(0);
        const rAddress = await raffle.getAddress();
        await token.connect(player1).approve(rAddress, ticketPrice);
        await expect(
          raffle.connect(player1).buySingleTicket(),
        ).to.changeTokenBalance(token, player1, -ticketPrice);
        expect(await raffle.pot()).to.equal(ticketPrice);

        await token
          .connect(player2)
          .approve(rAddress, ticketPrice * PRICE_10_TICKET_MULTIPLIER);
        await expect(
          raffle.connect(player2).buy10Tickets(),
        ).to.changeTokenBalance(
          token,
          player2,
          -ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
        expect(await raffle.pot()).to.equal(
          ticketPrice * (PRICE_10_TICKET_MULTIPLIER + 1n),
        );

        await token
          .connect(player3)
          .approve(rAddress, ticketPrice * PRICE_100_TICKET_MULTIPLIER);
        await expect(
          raffle.connect(player3).buy100Tickets(),
        ).to.changeTokenBalance(
          token,
          player3,
          -ticketPrice * PRICE_100_TICKET_MULTIPLIER,
        );
        expect(await raffle.pot()).to.equal(
          ticketPrice *
            (PRICE_100_TICKET_MULTIPLIER + PRICE_10_TICKET_MULTIPLIER + 1n),
        );
        expect(await token.balanceOf(rAddress)).to.equal(
          ticketPrice *
            (PRICE_100_TICKET_MULTIPLIER + PRICE_10_TICKET_MULTIPLIER + 1n),
        );
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
        .approve(rAddress, ticketPrice * PRICE_10_TICKET_MULTIPLIER);
      await raffle.connect(player).buy10Tickets();
      raffleInstance = raffle;
    });

    it("Should show the correct pot size", async () => {
      expect(await raffleInstance.pot()).to.equal(
        price * PRICE_10_TICKET_MULTIPLIER,
      );
    });

    it("Should show correct prize amount", async () => {
      expect(await raffleInstance.prizePool()).to.equal(
        (price * PRICE_10_TICKET_MULTIPLIER) / 2n,
      );
    });

    it("Should show the correct donation amount", async () => {
      const commision = ((price * PRICE_10_TICKET_MULTIPLIER) / 2n / 100n) * 5n;
      expect(await raffleInstance.donationAmount()).to.equal(
        (price * PRICE_10_TICKET_MULTIPLIER) / 2n - commision,
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
          ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
      await raffle.connect(player).buy10Tickets();
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_10_TICKET_MULTIPLIER);

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
          ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
      await raffle.connect(player).buy10Tickets();
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_10_TICKET_MULTIPLIER);

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
          ticketPrice * PRICE_100_TICKET_MULTIPLIER,
        );
      await raffle.connect(player).buy100Tickets();
      const pot = await raffle.pot();
      expect(pot).to.equal(ticketPrice * PRICE_100_TICKET_MULTIPLIER);

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
          ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
      await raffle.connect(player).buy10Tickets();
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
          ticketPrice * PRICE_10_TICKET_MULTIPLIER,
        );
      await raffle.connect(player).buy10Tickets();
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
  });
});
