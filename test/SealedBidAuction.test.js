const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { makeCommitment, randomSecret, BIDDING_DURATION, REVEAL_DURATION } = require("./helpers/commit");

// Phase enum: 0 Bidding, 1 Reveal, 2 Ended, 3 Cancelled
const Phase = { Bidding: 0n, Reveal: 1n, Ended: 2n, Cancelled: 3n };

describe("SealedBidAuction", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol, beneficiary, attacker] = await ethers.getSigners();
    const Auction = await ethers.getContractFactory("SealedBidAuction");
    const auction = await Auction.deploy(BIDDING_DURATION, REVEAL_DURATION, beneficiary.address);
    await auction.waitForDeployment();
    return { auction, owner, alice, bob, carol, beneficiary, attacker };
  }

  describe("Deployment", function () {
    it("TC-SB-00: khởi tạo owner, beneficiary, deadline và pha Bidding", async function () {
      const { auction, owner, beneficiary } = await loadFixture(deployFixture);
      const deployedAt = BigInt(await time.latest());

      expect(await auction.owner()).to.equal(owner.address);
      expect(await auction.beneficiary()).to.equal(beneficiary.address);
      expect(await auction.biddingEnd()).to.equal(deployedAt + BIDDING_DURATION);
      expect(await auction.revealEnd()).to.equal(deployedAt + BIDDING_DURATION + REVEAL_DURATION);
      expect(await auction.currentPhase()).to.equal(Phase.Bidding);
    });

    it("TC-SB-00b: currentPhase chuyển Bidding -> Reveal -> Ended theo thời gian", async function () {
      const { auction } = await loadFixture(deployFixture);
      await time.increaseTo(await auction.biddingEnd());
      expect(await auction.currentPhase()).to.equal(Phase.Reveal);
      await time.increaseTo(await auction.revealEnd());
      expect(await auction.currentPhase()).to.equal(Phase.Ended);
    });

    it("TC-SB-00c: helper makeCommitment trả về bytes32 khác 0 và phụ thuộc bidder", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const secret = randomSecret();
      const value = ethers.parseEther("1");
      const a = makeCommitment(value, secret, alice.address, await auction.getAddress());
      const b = makeCommitment(value, secret, bob.address, await auction.getAddress());
      expect(a).to.match(/^0x[0-9a-f]{64}$/);
      expect(a).to.not.equal(b); // chống copy commitment
    });
  });

  describe("Happy path", function () {
    it("TC-SB-01: commit 3 bid -> reveal -> auctionEnd -> đúng winner -> losers & beneficiary withdraw", async function () {
      const { auction, alice, bob, carol, beneficiary } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();

      const valAlice = ethers.parseEther("1");
      const depAlice = ethers.parseEther("1");
      const secAlice = randomSecret();
      const comAlice = makeCommitment(valAlice, secAlice, alice.address, auctionAddr);

      const valBob = ethers.parseEther("2");
      const depBob = ethers.parseEther("3");
      const secBob = randomSecret();
      const comBob = makeCommitment(valBob, secBob, bob.address, auctionAddr);

      const valCarol = ethers.parseEther("1.5");
      const depCarol = ethers.parseEther("1.5");
      const secCarol = randomSecret();
      const comCarol = makeCommitment(valCarol, secCarol, carol.address, auctionAddr);

      // 1. Commit phase
      await expect(auction.connect(alice).commitBid(comAlice, { value: depAlice }))
        .to.emit(auction, "BidCommitted")
        .withArgs(alice.address, comAlice, depAlice);

      await expect(auction.connect(bob).commitBid(comBob, { value: depBob }))
        .to.emit(auction, "BidCommitted")
        .withArgs(bob.address, comBob, depBob);

      await expect(auction.connect(carol).commitBid(comCarol, { value: depCarol }))
        .to.emit(auction, "BidCommitted")
        .withArgs(carol.address, comCarol, depCarol);

      // 2. Advance to Reveal phase
      await time.increaseTo(await auction.biddingEnd());

      // 3. Reveal bids: Alice (1 ETH) -> Bob (2 ETH, outbids Alice) -> Carol (1.5 ETH, lower than Bob)
      await expect(auction.connect(alice).revealBid(valAlice, secAlice))
        .to.emit(auction, "HighestBidIncreased")
        .withArgs(alice.address, valAlice)
        .and.to.emit(auction, "BidRevealed")
        .withArgs(alice.address, valAlice, true);

      await expect(auction.connect(bob).revealBid(valBob, secBob))
        .to.emit(auction, "HighestBidIncreased")
        .withArgs(bob.address, valBob)
        .and.to.emit(auction, "BidRevealed")
        .withArgs(bob.address, valBob, true);

      await expect(auction.connect(carol).revealBid(valCarol, secCarol))
        .to.emit(auction, "BidRevealed")
        .withArgs(carol.address, valCarol, false);

      expect(await auction.highestBidder()).to.equal(bob.address);
      expect(await auction.highestBid()).to.equal(valBob);
      expect(await auction.unrevealedDeposits()).to.equal(0n);

      // 4. Advance to Ended phase and finalize auction
      await time.increaseTo(await auction.revealEnd());
      await expect(auction.auctionEnd())
        .to.emit(auction, "AuctionEnded")
        .withArgs(bob.address, valBob);
      expect(await auction.currentPhase()).to.equal(Phase.Ended);

      // 5. Withdrawals: Alice (1 ETH), Carol (1.5 ETH), Bob (1 ETH excess), Beneficiary (2 ETH)
      const txAlice = auction.connect(alice).withdraw();
      await expect(txAlice).to.emit(auction, "Withdrawal").withArgs(alice.address, depAlice);
      await expect(txAlice).to.changeEtherBalances([auction, alice], [-depAlice, depAlice]);

      const txCarol = auction.connect(carol).withdraw();
      await expect(txCarol).to.emit(auction, "Withdrawal").withArgs(carol.address, depCarol);
      await expect(txCarol).to.changeEtherBalances([auction, carol], [-depCarol, depCarol]);

      const bobRefund = depBob - valBob; // 1 ETH
      const txBob = auction.connect(bob).withdraw();
      await expect(txBob).to.emit(auction, "Withdrawal").withArgs(bob.address, bobRefund);
      await expect(txBob).to.changeEtherBalances([auction, bob], [-bobRefund, bobRefund]);

      const txBeneficiary = auction.connect(beneficiary).withdraw();
      await expect(txBeneficiary).to.emit(auction, "Withdrawal").withArgs(beneficiary.address, valBob);
      await expect(txBeneficiary).to.changeEtherBalances([auction, beneficiary], [-valBob, valBob]);

      expect(await ethers.provider.getBalance(auctionAddr)).to.equal(0n);
    });
  });

  describe("Phase guards (AC-QA-02)", function () {
    it("TC-SB-02: commitBid sau biddingEnd revert TooLate", async function () {
      const { auction, owner, alice } = await loadFixture(deployFixture);
      const biddingEnd = await auction.biddingEnd();
      const commitment = makeCommitment(ethers.parseEther("1"), randomSecret(), alice.address, await auction.getAddress());

      await time.increaseTo(biddingEnd);
      await expect(auction.connect(alice).commitBid(commitment, { value: ethers.parseEther("1") }))
        .to.be.revertedWithCustomError(auction, "TooLate")
        .withArgs(biddingEnd);

      await expect(auction.connect(owner).cancelAuction())
        .to.be.revertedWithCustomError(auction, "TooLate")
        .withArgs(biddingEnd);
    });

    it("TC-SB-03: revealBid trước biddingEnd revert TooEarly", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const biddingEnd = await auction.biddingEnd();
      const secret = randomSecret();
      const value = ethers.parseEther("1");
      const commitment = makeCommitment(value, secret, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitment, { value: value });
      await expect(auction.connect(alice).revealBid(value, secret))
        .to.be.revertedWithCustomError(auction, "TooEarly")
        .withArgs(biddingEnd);
    });

    it("TC-SB-04: auctionEnd trước revealEnd revert TooEarly", async function () {
      const { auction } = await loadFixture(deployFixture);
      const revealEnd = await auction.revealEnd();

      await expect(auction.auctionEnd())
        .to.be.revertedWithCustomError(auction, "TooEarly")
        .withArgs(revealEnd);

      await time.increaseTo(await auction.biddingEnd());
      await expect(auction.auctionEnd())
        .to.be.revertedWithCustomError(auction, "TooEarly")
        .withArgs(revealEnd);
    });

    it("TC-SB-05: revealBid sau revealEnd revert TooLate", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const revealEnd = await auction.revealEnd();
      const secret = randomSecret();
      const value = ethers.parseEther("1");
      const commitment = makeCommitment(value, secret, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitment, { value: value });
      await time.increaseTo(revealEnd);

      await expect(auction.connect(alice).revealBid(value, secret))
        .to.be.revertedWithCustomError(auction, "TooLate")
        .withArgs(revealEnd);
    });
  });

  describe("Fraudulent reveal (AC-QA-03)", function () {
    it("TC-SB-06: reveal sai secret revert InvalidReveal", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const secret1 = randomSecret();
      const secret2 = randomSecret();
      const value = ethers.parseEther("1");
      const commitment = makeCommitment(value, secret1, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitment, { value: value });
      await time.increaseTo(await auction.biddingEnd());

      await expect(auction.connect(alice).revealBid(value, secret2))
        .to.be.revertedWithCustomError(auction, "InvalidReveal");
    });

    it("TC-SB-07: reveal sai value revert InvalidReveal", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const secret = randomSecret();
      const value1 = ethers.parseEther("1");
      const value2 = ethers.parseEther("2");
      const commitment = makeCommitment(value1, secret, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitment, { value: value2 });
      await time.increaseTo(await auction.biddingEnd());

      await expect(auction.connect(alice).revealBid(value2, secret))
        .to.be.revertedWithCustomError(auction, "InvalidReveal");
    });

    it("TC-SB-08: sao chép commitment của người khác -> reveal revert InvalidReveal", async function () {
      const { auction, alice, attacker } = await loadFixture(deployFixture);
      const secretAlice = randomSecret();
      const valueAlice = ethers.parseEther("1");
      const commitmentAlice = makeCommitment(valueAlice, secretAlice, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitmentAlice, { value: valueAlice });
      // Attacker copies Alice's exact commitment bytes32
      await auction.connect(attacker).commitBid(commitmentAlice, { value: valueAlice });

      await time.increaseTo(await auction.biddingEnd());

      await expect(auction.connect(attacker).revealBid(valueAlice, secretAlice))
        .to.be.revertedWithCustomError(auction, "InvalidReveal");
    });

    it("TC-SB-09: deposit < value revert InsufficientDeposit", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const secret = randomSecret();
      const value = ethers.parseEther("2");
      const deposit = ethers.parseEther("1");
      const commitment = makeCommitment(value, secret, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitment, { value: deposit });
      await time.increaseTo(await auction.biddingEnd());

      await expect(auction.connect(alice).revealBid(value, secret))
        .to.be.revertedWithCustomError(auction, "InsufficientDeposit")
        .withArgs(deposit, value);
    });
  });

  describe("Access control & withdrawal (AC-QA-04)", function () {
    it("TC-SB-10: withdraw khi số dư 0 revert NothingToWithdraw", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await expect(auction.connect(alice).withdraw())
        .to.be.revertedWithCustomError(auction, "NothingToWithdraw");
    });

    it("TC-SB-11: non-owner gọi pause/cancelAuction revert OwnableUnauthorizedAccount", async function () {
      const { auction, alice } = await loadFixture(deployFixture);

      await expect(auction.connect(alice).pause())
        .to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);

      await expect(auction.connect(alice).unpause())
        .to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);

      await expect(auction.connect(alice).cancelAuction())
        .to.be.revertedWithCustomError(auction, "OwnableUnauthorizedAccount")
        .withArgs(alice.address);
    });

    it("TC-SB-12: commit lần 2 revert AlreadyCommitted", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();
      const commitment1 = makeCommitment(ethers.parseEther("1"), randomSecret(), alice.address, auctionAddr);
      const commitment2 = makeCommitment(ethers.parseEther("2"), randomSecret(), alice.address, auctionAddr);

      await expect(auction.connect(alice).commitBid(ethers.ZeroHash, { value: ethers.parseEther("1") }))
        .to.be.revertedWithCustomError(auction, "ZeroCommitment");

      await expect(auction.connect(alice).commitBid(commitment1, { value: 0n }))
        .to.be.revertedWithCustomError(auction, "ZeroDeposit");

      await auction.connect(alice).commitBid(commitment1, { value: ethers.parseEther("1") });

      await expect(auction.connect(alice).commitBid(commitment2, { value: ethers.parseEther("2") }))
        .to.be.revertedWithCustomError(auction, "AlreadyCommitted");
    });

    it("TC-SB-13: reveal lần 2 revert AlreadyRevealed", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const secret = randomSecret();
      const value = ethers.parseEther("1");
      const commitment = makeCommitment(value, secret, alice.address, await auction.getAddress());

      await auction.connect(alice).commitBid(commitment, { value: value });
      await time.increaseTo(await auction.biddingEnd());

      // Bob never committed -> NoCommitment
      await expect(auction.connect(bob).revealBid(value, secret))
        .to.be.revertedWithCustomError(auction, "NoCommitment");

      // Alice reveals once (valid) -> second reveal reverts AlreadyRevealed
      await auction.connect(alice).revealBid(value, secret);
      await expect(auction.connect(alice).revealBid(value, secret))
        .to.be.revertedWithCustomError(auction, "AlreadyRevealed");
    });

    it("TC-SB-14: auctionEnd lần 2 revert AuctionAlreadyEnded", async function () {
      const { auction, beneficiary } = await loadFixture(deployFixture);
      await time.increaseTo(await auction.revealEnd());

      // Also verifies auctionEnd when payout == 0 (no bids at all)
      await expect(auction.auctionEnd())
        .to.emit(auction, "AuctionEnded")
        .withArgs(ethers.ZeroAddress, 0n);

      expect(await auction.ended()).to.equal(true);
      expect(await auction.pendingReturns(beneficiary.address)).to.equal(0n);

      await expect(auction.auctionEnd())
        .to.be.revertedWithCustomError(auction, "AuctionAlreadyEnded");
    });
  });

  describe("Edge cases", function () {
    it("TC-SB-15: cọc chưa reveal bị tịch thu cho beneficiary khi auctionEnd", async function () {
      const { auction, alice, carol, beneficiary } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();

      const valAlice = ethers.parseEther("1");
      const secAlice = randomSecret();
      const comAlice = makeCommitment(valAlice, secAlice, alice.address, auctionAddr);

      const depCarol = ethers.parseEther("2");
      const comCarol = makeCommitment(ethers.parseEther("1.5"), randomSecret(), carol.address, auctionAddr);

      await auction.connect(alice).commitBid(comAlice, { value: valAlice });
      await auction.connect(carol).commitBid(comCarol, { value: depCarol });

      await time.increaseTo(await auction.biddingEnd());
      // Only Alice reveals; Carol does not reveal
      await auction.connect(alice).revealBid(valAlice, secAlice);

      expect(await auction.unrevealedDeposits()).to.equal(depCarol);

      await time.increaseTo(await auction.revealEnd());
      await auction.auctionEnd();

      expect(await auction.unrevealedDeposits()).to.equal(0n);
      expect(await auction.pendingReturns(beneficiary.address)).to.equal(valAlice + depCarol);
    });

    it("TC-SB-16: cancelAuction -> bidder rút lại toàn bộ cọc", async function () {
      const { auction, owner, alice, bob } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();
      const depAlice = ethers.parseEther("2");
      const secAlice = randomSecret();
      const comAlice = makeCommitment(depAlice, secAlice, alice.address, auctionAddr);

      await auction.connect(alice).commitBid(comAlice, { value: depAlice });

      await expect(auction.connect(owner).cancelAuction())
        .to.emit(auction, "AuctionCancelled");

      expect(await auction.currentPhase()).to.equal(Phase.Cancelled);

      // Non-bidder withdrawing during Cancelled reverts NothingToWithdraw
      await expect(auction.connect(bob).withdraw())
        .to.be.revertedWithCustomError(auction, "NothingToWithdraw");

      // Alice withdraws full unrevealed deposit
      const txWithdraw = auction.connect(alice).withdraw();
      await expect(txWithdraw).to.emit(auction, "Withdrawal").withArgs(alice.address, depAlice);
      await expect(txWithdraw).to.changeEtherBalances([auction, alice], [-depAlice, depAlice]);

      // Second withdraw by Alice reverts NothingToWithdraw
      await expect(auction.connect(alice).withdraw())
        .to.be.revertedWithCustomError(auction, "NothingToWithdraw");

      // Calling commitBid, cancelAuction, revealBid, auctionEnd after cancel reverts AuctionCancelledError
      await expect(auction.connect(bob).commitBid(comAlice, { value: depAlice }))
        .to.be.revertedWithCustomError(auction, "AuctionCancelledError");

      await expect(auction.connect(owner).cancelAuction())
        .to.be.revertedWithCustomError(auction, "AuctionCancelledError");

      await time.increaseTo(await auction.biddingEnd());
      await expect(auction.connect(alice).revealBid(depAlice, secAlice))
        .to.be.revertedWithCustomError(auction, "AuctionCancelledError");

      await time.increaseTo(await auction.revealEnd());
      await expect(auction.auctionEnd())
        .to.be.revertedWithCustomError(auction, "AuctionCancelledError");
    });

    it("TC-SB-17: paused chặn commitBid (EnforcedPause) nhưng withdraw vẫn chạy", async function () {
      const { auction, owner, alice, bob } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();

      const valAlice = ethers.parseEther("1");
      const depAlice = ethers.parseEther("2");
      const secAlice = randomSecret();
      const comAlice = makeCommitment(valAlice, secAlice, alice.address, auctionAddr);

      const comBob = makeCommitment(valAlice, randomSecret(), bob.address, auctionAddr);

      await auction.connect(alice).commitBid(comAlice, { value: depAlice });

      // Pause during Bidding: blocks commitBid, unpause restores commitBid
      await auction.connect(owner).pause();
      await expect(auction.connect(bob).commitBid(comBob, { value: valAlice }))
        .to.be.revertedWithCustomError(auction, "EnforcedPause");

      await auction.connect(owner).unpause();
      await auction.connect(bob).commitBid(comBob, { value: valAlice });

      // Move to Reveal phase
      await time.increaseTo(await auction.biddingEnd());
      await auction.connect(alice).revealBid(valAlice, secAlice);

      // Pause during Reveal: blocks revealBid, but withdraw() still succeeds
      await auction.connect(owner).pause();
      await expect(auction.connect(bob).revealBid(valAlice, randomSecret()))
        .to.be.revertedWithCustomError(auction, "EnforcedPause");

      const aliceRefund = depAlice - valAlice;
      await expect(auction.connect(alice).withdraw())
        .to.emit(auction, "Withdrawal")
        .withArgs(alice.address, aliceRefund);
    });

    it("TC-SB-18: hợp đồng tấn công reentrancy không rút được 2 lần", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();

      const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
      const attackerContract = await AttackerFactory.deploy();
      await attackerContract.waitForDeployment();
      const attackerAddr = await attackerContract.getAddress();

      const RejecterFactory = await ethers.getContractFactory("EthRejecter");
      const rejecterContract = await RejecterFactory.deploy();
      await rejecterContract.waitForDeployment();
      const rejecterAddr = await rejecterContract.getAddress();

      // Alice commits 3 ETH to ensure contract holds extra liquidity
      const valAlice = ethers.parseEther("3");
      const secAlice = randomSecret();
      const comAlice = makeCommitment(valAlice, secAlice, alice.address, auctionAddr);
      await auction.connect(alice).commitBid(comAlice, { value: valAlice });

      // Attacker commits deposit=2 ETH, value=1 ETH (so 1 ETH refund on reveal)
      const valAttacker = ethers.parseEther("1");
      const depAttacker = ethers.parseEther("2");
      const secAttacker = randomSecret();
      const comAttacker = makeCommitment(valAttacker, secAttacker, attackerAddr, auctionAddr);
      await attackerContract.commit(auctionAddr, comAttacker, { value: depAttacker });

      // EthRejecter commits deposit=2 ETH, value=1 ETH
      const valRejecter = ethers.parseEther("1");
      const depRejecter = ethers.parseEther("2");
      const secRejecter = randomSecret();
      const comRejecter = makeCommitment(valRejecter, secRejecter, rejecterAddr, auctionAddr);
      await rejecterContract.commit(auctionAddr, comRejecter, { value: depRejecter });

      await time.increaseTo(await auction.biddingEnd());
      await auction.connect(alice).revealBid(valAlice, secAlice);
      await attackerContract.reveal(auctionAddr, valAttacker, secAttacker);
      await rejecterContract.reveal(auctionAddr, valRejecter, secRejecter);

      expect(await auction.pendingReturns(attackerAddr)).to.equal(depAttacker);
      expect(await auction.pendingReturns(rejecterAddr)).to.equal(depRejecter);

      // Reentrancy attack on withdraw() is blocked by nonReentrant -> inner withdraw reverts -> outer call reverts TransferFailed
      const balanceBefore = await ethers.provider.getBalance(auctionAddr);
      await expect(attackerContract.attackWithdraw(auctionAddr))
        .to.be.revertedWithCustomError(auction, "TransferFailed");
      expect(await ethers.provider.getBalance(auctionAddr)).to.equal(balanceBefore);

      // Direct TransferFailed check via EthRejecter
      await expect(rejecterContract.triggerWithdraw(auctionAddr))
        .to.be.revertedWithCustomError(auction, "TransferFailed");

      // Invariant INV-1 holds: balance >= P + U + H
      const P = (await auction.pendingReturns(attackerAddr)) + (await auction.pendingReturns(rejecterAddr));
      const U = await auction.unrevealedDeposits();
      const H = await auction.highestBid();
      expect(await ethers.provider.getBalance(auctionAddr)).to.equal(P + U + H);
    });

    it("TC-SB-19: bid bằng nhau -> người reveal trước giữ highestBid", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const auctionAddr = await auction.getAddress();

      const value = ethers.parseEther("2");
      const secAlice = randomSecret();
      const secBob = randomSecret();
      const comAlice = makeCommitment(value, secAlice, alice.address, auctionAddr);
      const comBob = makeCommitment(value, secBob, bob.address, auctionAddr);

      await auction.connect(alice).commitBid(comAlice, { value: value });
      await auction.connect(bob).commitBid(comBob, { value: value });

      await time.increaseTo(await auction.biddingEnd());

      await expect(auction.connect(alice).revealBid(value, secAlice))
        .to.emit(auction, "BidRevealed")
        .withArgs(alice.address, value, true);

      await expect(auction.connect(bob).revealBid(value, secBob))
        .to.emit(auction, "BidRevealed")
        .withArgs(bob.address, value, false);

      expect(await auction.highestBidder()).to.equal(alice.address);
      expect(await auction.highestBid()).to.equal(value);
      expect(await auction.pendingReturns(bob.address)).to.equal(value);
      expect(await auction.pendingReturns(alice.address)).to.equal(0n);
    });
  });
});
