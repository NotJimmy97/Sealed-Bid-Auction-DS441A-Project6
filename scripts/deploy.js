/**
 * Deploy SealedBidAuction + EnglishAuction, ghi địa chỉ + ABI vào frontend/src/contracts.json.
 * Dùng: npx hardhat run scripts/deploy.js --network ganache
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const biddingDuration = BigInt(process.env.BIDDING_DURATION || 300);
  const revealDuration = BigInt(process.env.REVEAL_DURATION || 300);
  const minIncrement = ethers.parseEther(process.env.MIN_INCREMENT || "0.01");
  const beneficiary = process.env.BENEFICIARY || deployer.address;

  console.log(`Network   : ${hre.network.name}`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Beneficiary: ${beneficiary}`);

  const sealed = await ethers.deployContract("SealedBidAuction", [biddingDuration, revealDuration, beneficiary]);
  await sealed.waitForDeployment();
  const english = await ethers.deployContract("EnglishAuction", [biddingDuration, minIncrement, beneficiary]);
  await english.waitForDeployment();

  const { chainId } = await ethers.provider.getNetwork();
  const out = {
    chainId: Number(chainId),
    deployedAt: new Date().toISOString(),
    sealedBidAuction: {
      address: await sealed.getAddress(),
      abi: (await hre.artifacts.readArtifact("SealedBidAuction")).abi,
    },
    englishAuction: {
      address: await english.getAddress(),
      abi: (await hre.artifacts.readArtifact("EnglishAuction")).abi,
    },
  };

  const file = path.join(__dirname, "..", "frontend", "src", "contracts.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  console.log(`SealedBidAuction: ${out.sealedBidAuction.address}`);
  console.log(`EnglishAuction  : ${out.englishAuction.address}`);
  console.log(`biddingEnd=${await sealed.biddingEnd()} revealEnd=${await sealed.revealEnd()}`);
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
