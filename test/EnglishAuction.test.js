const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { BIDDING_DURATION, MIN_INCREMENT } = require("./helpers/commit");

describe("EnglishAuction", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol, beneficiary] = await ethers.getSigners();
    const Auction = await ethers.getContractFactory("EnglishAuction");
    const auction = await Auction.deploy(BIDDING_DURATION, MIN_INCREMENT, beneficiary.address);
    await auction.waitForDeployment();
    return { auction, owner, alice, bob, carol, beneficiary };
  }

  describe("Deployment", function () {
    it("TC-EN-00: khởi tạo owner, beneficiary, biddingEnd, minIncrement", async function () {
      const { auction, owner, beneficiary } = await loadFixture(deployFixture);
      const deployedAt = BigInt(await time.latest());
      expect(await auction.owner()).to.equal(owner.address);
      expect(await auction.beneficiary()).to.equal(beneficiary.address);
      expect(await auction.biddingEnd()).to.equal(deployedAt + BIDDING_DURATION);
      expect(await auction.minIncrement()).to.equal(MIN_INCREMENT);
      expect(await auction.minNextBid()).to.equal(1n);
    });
  });

  describe("Bidding", function () {
    it("TC-EN-01: happy path A bid -> B outbid -> auctionEnd -> A withdraw, beneficiary withdraw", async function () {
      const { auction, alice, bob, beneficiary } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();
      const bidAlice = ethers.parseEther("1.0");
      const bidBob = ethers.parseEther("1.5");

      await expect(auction.connect(alice).bid({ value: bidAlice }))
        .to.emit(auction, "HighestBidIncreased")
        .withArgs(alice.address, bidAlice);

      expect(await auction.highestBidder()).to.equal(alice.address);
      expect(await auction.highestBid()).to.equal(bidAlice);
      expect(await auction.minNextBid()).to.equal(bidAlice + MIN_INCREMENT);

      await expect(auction.connect(bob).bid({ value: bidBob }))
        .to.emit(auction, "HighestBidIncreased")
        .withArgs(bob.address, bidBob);

      expect(await auction.highestBidder()).to.equal(bob.address);
      expect(await auction.highestBid()).to.equal(bidBob);
      expect(await auction.pendingReturns(alice.address)).to.equal(bidAlice);

      await time.increaseTo(await auction.biddingEnd());
      await expect(auction.auctionEnd())
        .to.emit(auction, "AuctionEnded")
        .withArgs(bob.address, bidBob);

      const txAlice = auction.connect(alice).withdraw();
      await expect(txAlice).to.emit(auction, "Withdrawal").withArgs(alice.address, bidAlice);
      await expect(txAlice).to.changeEtherBalances([auction, alice], [-bidAlice, bidAlice]);

      const txBeneficiary = auction.connect(beneficiary).withdraw();
      await expect(txBeneficiary).to.emit(auction, "Withdrawal").withArgs(beneficiary.address, bidBob);
      await expect(txBeneficiary).to.changeEtherBalances([auction, beneficiary], [-bidBob, bidBob]);

      expect(await ethers.provider.getBalance(auctionAddr)).to.equal(0n);
    });

    it("TC-EN-02: bid < highestBid + minIncrement revert BidTooLow", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const bidAlice = ethers.parseEther("1.0");

      // Initial bid with 0 wei reverts BidTooLow(1)
      await expect(auction.connect(alice).bid({ value: 0n }))
        .to.be.revertedWithCustomError(auction, "BidTooLow")
        .withArgs(1n);

      await auction.connect(alice).bid({ value: bidAlice });

      const required = bidAlice + MIN_INCREMENT;
      await expect(auction.connect(bob).bid({ value: required - 1n }))
        .to.be.revertedWithCustomError(auction, "BidTooLow")
        .withArgs(required);
    });

    it("TC-EN-03: người bị vượt giá rút lại tiền qua withdraw (pull-payment)", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();
      const bidAlice = ethers.parseEther("1.0");
      const bidBob = ethers.parseEther("1.5");

      const RejecterFactory = await ethers.getContractFactory("EthRejecter");
      const rejecter = await RejecterFactory.deploy();
      await rejecter.waitForDeployment();

      const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await AttackerFactory.deploy();
      await attacker.waitForDeployment();

      // Rejecter bids (0.4 ETH), Attacker outbids (0.5 ETH), Alice outbids (1.0 ETH), Bob outbids (1.5 ETH)
      await rejecter.bid(auctionAddr, { value: ethers.parseEther("0.4") });
      await attacker.bid(auctionAddr, { value: ethers.parseEther("0.5") });
      await auction.connect(alice).bid({ value: bidAlice });
      await auction.connect(bob).bid({ value: bidBob });

      // Alice withdraws immediately while auction is still in Bidding phase
      const txWithdraw = auction.connect(alice).withdraw();
      await expect(txWithdraw).to.emit(auction, "Withdrawal").withArgs(alice.address, bidAlice);
      await expect(txWithdraw).to.changeEtherBalances([auction, alice], [-bidAlice, bidAlice]);

      // Second withdraw by Alice reverts NothingToWithdraw
      await expect(auction.connect(alice).withdraw())
        .to.be.revertedWithCustomError(auction, "NothingToWithdraw");

      // EthRejecter attempting withdraw reverts TransferFailed
      await expect(rejecter.triggerWithdraw(auctionAddr))
        .to.be.revertedWithCustomError(auction, "TransferFailed");

      // ReentrancyAttacker attempting reentrant withdraw reverts TransferFailed
      await expect(attacker.attackWithdraw(auctionAddr))
        .to.be.revertedWithCustomError(auction, "TransferFailed");
    });

    it("TC-EN-04: bid sau biddingEnd revert TooLate", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const biddingEnd = await auction.biddingEnd();

      // Calling auctionEnd before biddingEnd reverts TooEarly
      await expect(auction.auctionEnd())
        .to.be.revertedWithCustomError(auction, "TooEarly")
        .withArgs(biddingEnd);

      await time.increaseTo(biddingEnd);
      await expect(auction.connect(alice).bid({ value: ethers.parseEther("1.0") }))
        .to.be.revertedWithCustomError(auction, "TooLate")
        .withArgs(biddingEnd);
    });

    it("TC-EN-05: auctionEnd lần 2 revert AuctionAlreadyEnded", async function () {
      const { auction, beneficiary } = await loadFixture(deployFixture);
      await time.increaseTo(await auction.biddingEnd());

      // First auctionEnd (with no bids, highestBid == 0)
      await expect(auction.auctionEnd())
        .to.emit(auction, "AuctionEnded")
        .withArgs(ethers.ZeroAddress, 0n);

      expect(await auction.ended()).to.equal(true);
      expect(await auction.pendingReturns(beneficiary.address)).to.equal(0n);

      // Second auctionEnd reverts AuctionAlreadyEnded
      await expect(auction.auctionEnd())
        .to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
    });
  });
});
