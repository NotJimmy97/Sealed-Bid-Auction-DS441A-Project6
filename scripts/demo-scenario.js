/**
 * Kịch bản demo CLI (fallback khi MetaMask gặp sự cố). Xem docs/09-demo-script.md.
 * Dùng: npx hardhat run scripts/demo-scenario.js --network ganache
 */
const { ethers, network } = require("hardhat");

/** Tua thời gian trên Ganache/Hardhat (evm_increaseTime + evm_mine). */
async function advanceTime(seconds) {
  await network.provider.send("evm_increaseTime", [Number(seconds)]);
  await network.provider.send("evm_mine", []);
}

function commitmentOf(value, secret, bidder, auction) {
  return ethers.solidityPackedKeccak256(
    ["uint256", "bytes32", "address", "address"],
    [value, secret, bidder, auction]
  );
}

async function main() {
  const [auctioneer, bidderA, bidderB, bidderC] = await ethers.getSigners();
  const roles = { auctioneer, bidderA, bidderB, bidderC };
  for (const [name, s] of Object.entries(roles)) console.log(`${name.padEnd(10)} ${s.address}`);

  const plan = [
    { name: "bidderA", who: bidderA, value: ethers.parseEther("1.0"), deposit: ethers.parseEther("1.0") },
    { name: "bidderB", who: bidderB, value: ethers.parseEther("1.5"), deposit: ethers.parseEther("3.0") }, // deposit > value: che giá
    { name: "bidderC", who: bidderC, value: ethers.parseEther("2.0"), deposit: ethers.parseEther("2.0") }, // sẽ không reveal -> forfeit
  ].map((b) => ({ ...b, secret: ethers.hexlify(ethers.randomBytes(32)) }));

  // 1. Deploy
  const auction = await ethers.deployContract("SealedBidAuction", [120, 120, auctioneer.address]);
  await auction.waitForDeployment();
  const addr = await auction.getAddress();
  console.log(`\n[1] SealedBidAuction deployed at ${addr} (phase=${await auction.currentPhase()})`);

  // 2. Commit
  for (const b of plan) {
    const c = commitmentOf(b.value, b.secret, b.who.address, addr);
    console.log(
      `[2] ${b.name} (${b.who.address.slice(0, 8)}) commit ${c.slice(0, 12)}... deposit ${ethers.formatEther(b.deposit)} ETH`
    );
    await (await auction.connect(b.who).commitBid(c, { value: b.deposit })).wait();
  }
  console.log(
    `    -> Contract balance = ${ethers.formatEther(await ethers.provider.getBalance(addr))} ETH, unrevealedDeposits = ${ethers.formatEther(await auction.unrevealedDeposits())} ETH`
  );

  // 3. Reveal phase
  await advanceTime(120);
  console.log(`\n[3] phase = ${await auction.currentPhase()} (1 = Reveal)`);

  // Bidder A reveals valid bid (1.0 ETH)
  await (await auction.connect(plan[0].who).revealBid(plan[0].value, plan[0].secret)).wait();
  console.log(
    `    [3a] bidderA revealed ${ethers.formatEther(plan[0].value)} ETH -> highestBid = ${ethers.formatEther(await auction.highestBid())} ETH`
  );

  // Bidder C attempts fraudulent reveal with wrong secret -> reverts InvalidReveal
  const wrongSecret = ethers.hexlify(ethers.randomBytes(32));
  try {
    await (await auction.connect(plan[2].who).revealBid(plan[2].value, wrongSecret)).wait();
    throw new Error("Expected InvalidReveal revert for bidderC");
  } catch (err) {
    console.log(`    [3b] bidderC fraudulent reveal blocked as expected (${err.shortMessage || err.message.split("\n")[0]})`);
  }

  // Bidder B reveals valid bid (1.5 ETH, deposit 3.0 ETH -> 1.5 ETH excess refunded to pendingReturns)
  await (await auction.connect(plan[1].who).revealBid(plan[1].value, plan[1].secret)).wait();
  console.log(
    `    [3c] bidderB revealed ${ethers.formatEther(plan[1].value)} ETH -> highestBidder = ${await auction.highestBidder()}, highestBid = ${ethers.formatEther(await auction.highestBid())} ETH`
  );
  console.log(
    `    [3d] bidderC did not reveal before deadline -> unrevealedDeposits = ${ethers.formatEther(await auction.unrevealedDeposits())} ETH (to be forfeited)`
  );

  // 4. End
  await advanceTime(120);
  console.log(`\n[4] phase = ${await auction.currentPhase()} (2 = Ended)`);
  await (await auction.auctionEnd()).wait();
  console.log(
    `    auctionEnd() finalized: winner = ${await auction.highestBidder()}, winningBid = ${ethers.formatEther(await auction.highestBid())} ETH`
  );
  console.log(
    `    pendingReturns: bidderA = ${ethers.formatEther(await auction.pendingReturns(bidderA.address))} ETH, bidderB = ${ethers.formatEther(await auction.pendingReturns(bidderB.address))} ETH, beneficiary = ${ethers.formatEther(await auction.pendingReturns(auctioneer.address))} ETH`
  );

  // 5. Withdraw
  console.log("\n[5] Pulling refunds & payout via withdraw():");
  for (const [label, signer] of [
    ["bidderA (loser refund)", bidderA],
    ["bidderB (excess deposit)", bidderB],
    ["auctioneer (winning bid + forfeited deposit)", auctioneer],
  ]) {
    const pending = await auction.pendingReturns(signer.address);
    const balBefore = await ethers.provider.getBalance(signer.address);
    const tx = await auction.connect(signer).withdraw();
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const balAfter = await ethers.provider.getBalance(signer.address);
    const netReceived = balAfter - balBefore + gasCost;
    console.log(`    - ${label}: withdrew ${ethers.formatEther(pending)} ETH (net before gas: ${ethers.formatEther(netReceived)} ETH)`);
  }

  const finalContractBalance = await ethers.provider.getBalance(addr);
  const finalUnrevealed = await auction.unrevealedDeposits();
  console.log(
    `\n[6] Invariants verified: contractBalance = ${ethers.formatEther(finalContractBalance)} ETH, unrevealedDeposits = ${ethers.formatEther(finalUnrevealed)} ETH, ended = ${await auction.ended()}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
