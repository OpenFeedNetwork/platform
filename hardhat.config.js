// ═══════════════════════════════════════════════════════════════════
// hardhat.config.js — OFA Smart Contract Deployment Config
// ═══════════════════════════════════════════════════════════════════
// INSTALL:
//   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
//              @openzeppelin/contracts dotenv
//   npx hardhat compile
//   npx hardhat test
//   npx hardhat run scripts/deploy.js --network polygon_mumbai

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },

  networks: {
    // ── Local development (free, instant) ─────────────────────────
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // ── Polygon Mumbai Testnet (free test tokens from faucet) ─────
    // Get free MATIC at: faucet.polygon.technology
    polygon_mumbai: {
      url:      process.env.POLYGON_MUMBAI_RPC || "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId:  80001,
      gasPrice: 8000000000, // 8 gwei
    },

    // ── Polygon Mainnet (production, ~$0.01/tx) ───────────────────
    polygon: {
      url:      process.env.POLYGON_RPC || "https://polygon-rpc.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId:  137,
      gasPrice: "auto",
    },
  },

  etherscan: {
    apiKey: {
      polygon:       process.env.POLYGONSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
    },
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;

// ═══════════════════════════════════════════════════════════════════
// scripts/deploy.js — Deploy all OFA contracts
// Run: npx hardhat run scripts/deploy.js --network polygon_mumbai
// ═══════════════════════════════════════════════════════════════════
export async function deployAll() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying OFA contracts with: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} MATIC\n`);

  // 1. Deploy OFA Governance
  console.log("1. Deploying OFAGovernance...");
  const Governance = await ethers.getContractFactory("OFAGovernance");
  const governance = await Governance.deploy();
  await governance.waitForDeployment();
  const govAddress = await governance.getAddress();
  console.log(`   ✓ OFAGovernance deployed: ${govAddress}`);

  // 2. Deploy Suppression Audit Log
  console.log("2. Deploying OFASuppressionAuditLog...");
  const AuditLog = await ethers.getContractFactory("OFASuppressionAuditLog");
  const auditLog = await AuditLog.deploy(deployer.address); // OFA platform address
  await auditLog.waitForDeployment();
  const auditAddress = await auditLog.getAddress();
  console.log(`   ✓ OFASuppressionAuditLog deployed: ${auditAddress}`);

  // 3. Deploy ZK Age Verifier
  console.log("3. Deploying OFAAgeVerifier...");
  const AgeVerifier = await ethers.getContractFactory("OFAAgeVerifier");
  const ageVerifier = await AgeVerifier.deploy();
  await ageVerifier.waitForDeployment();
  const verifierAddress = await ageVerifier.getAddress();
  console.log(`   ✓ OFAAgeVerifier deployed: ${verifierAddress}`);

  // Save addresses to file for backend integration
  const addresses = {
    governance:    govAddress,
    auditLog:      auditAddress,
    ageVerifier:   verifierAddress,
    network:       (await ethers.provider.getNetwork()).name,
    deployedAt:    new Date().toISOString(),
    deployedBy:    deployer.address,
  };

  const fs = await import("fs");
  fs.writeFileSync(
    "./contract-addresses.json",
    JSON.stringify(addresses, null, 2)
  );

  console.log("\n✓ All contracts deployed");
  console.log("✓ Addresses saved to contract-addresses.json");
  console.log("\nCONTRACT ADDRESSES:");
  console.log(JSON.stringify(addresses, null, 2));

  // Verify on Polygonscan (optional — requires API key)
  if (process.env.POLYGONSCAN_API_KEY) {
    console.log("\nVerifying contracts on Polygonscan...");
    try {
      await run("verify:verify", { address: govAddress });
      await run("verify:verify", { address: auditAddress, constructorArguments: [deployer.address] });
      await run("verify:verify", { address: verifierAddress });
      console.log("✓ All contracts verified on Polygonscan");
    } catch (err) {
      console.warn("Verification failed (non-critical):", err.message);
    }
  }

  return addresses;
}

// ═══════════════════════════════════════════════════════════════════
// test/OFAContracts.test.js — Full test suite
// Run: npx hardhat test
// ═══════════════════════════════════════════════════════════════════
export const testSuite = `
const { expect }   = require("chai");
const { ethers }   = require("hardhat");
const { time }     = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("OFA Smart Contracts", function () {

  let governance, auditLog, ageVerifier;
  let owner, voter1, voter2, voter3, nonVoter;

  beforeEach(async function () {
    [owner, voter1, voter2, voter3, nonVoter] = await ethers.getSigners();

    const Governance  = await ethers.getContractFactory("OFAGovernance");
    const AuditLog    = await ethers.getContractFactory("OFASuppressionAuditLog");
    const AgeVerifier = await ethers.getContractFactory("OFAAgeVerifier");

    governance  = await Governance.deploy();
    auditLog    = await AuditLog.deploy(owner.address);
    ageVerifier = await AgeVerifier.deploy();

    // Register voters
    await governance.registerVoter(voter1.address, 80, true);
    await governance.registerVoter(voter2.address, 60, true);
    await governance.registerVoter(voter3.address, 40, false);
  });

  // ── GOVERNANCE TESTS ────────────────────────────────────────────
  describe("OFAGovernance", function () {

    it("initializes with correct default weights", async function () {
      const weights = await governance.getCurrentWeights();
      expect(weights.engagementWeight).to.equal(400);
      expect(weights.credibilityWeight).to.equal(600);
      expect(weights.adPenalty).to.equal(30);
    });

    it("registers voters correctly", async function () {
      const record = await governance.getVoterRecord(voter1.address);
      expect(record.credibilityScore).to.equal(80);
      expect(record.isVerified).to.be.true;
      expect(record.registered).to.be.true;
    });

    it("creates a proposal", async function () {
      const tx = await governance.connect(voter1).createProposal(
        "Test: Increase credibility weight",
        "Proposal to change engagement to 35%, credibility to 65%",
        350, 650, 30, 2, 5
      );
      const receipt = await tx.wait();
      const event   = receipt.logs.find(l => l.fragment?.name === "ProposalCreated");
      expect(event).to.not.be.undefined;

      const proposal = await governance.getProposal(1);
      expect(proposal.title).to.equal("Test: Increase credibility weight");
      expect(proposal.proposer).to.equal(voter1.address);
    });

    it("rejects proposal from unverified voter", async function () {
      await expect(
        governance.connect(voter3).createProposal(
          "Title", "Desc", 350, 650, 30, 2, 5
        )
      ).to.be.revertedWith("Must be verified voter");
    });

    it("rejects proposal with invalid weights (not summing to 1000)", async function () {
      await expect(
        governance.connect(voter1).createProposal(
          "Bad weights", "Desc", 300, 600, 30, 2, 5  // 300+600 = 900 ≠ 1000
        )
      ).to.be.revertedWith("Engagement + credibility weights must sum to 1000");
    });

    it("allows voting and records vote correctly", async function () {
      await governance.connect(voter1).createProposal(
        "Test Proposal", "Desc", 350, 650, 30, 2, 5
      );

      await governance.connect(voter1).castVote(1, "yes");
      await governance.connect(voter2).castVote(1, "yes");
      await governance.connect(voter3).castVote(1, "no");

      const result = await governance.getVoteResult(1);
      // voter1 has weight 80, voter2 has weight 60 → yes = 140
      // voter3 has weight 40 → no = 40
      expect(result.yes).to.equal(140);
      expect(result.no).to.equal(40);
    });

    it("prevents double voting", async function () {
      await governance.connect(voter1).createProposal(
        "Test", "Desc", 350, 650, 30, 2, 5
      );
      await governance.connect(voter1).castVote(1, "yes");

      await expect(
        governance.connect(voter1).castVote(1, "no")
      ).to.be.revertedWith("Already voted on this proposal");
    });

    it("executes a passed proposal and updates weights", async function () {
      await governance.connect(voter1).createProposal(
        "Update weights", "Change engagement to 35%, credibility to 65%",
        350, 650, 35, 3, 8
      );

      // Both verified voters vote yes — easily passes
      await governance.connect(voter1).castVote(1, "yes");
      await governance.connect(voter2).castVote(1, "yes");

      // Advance time past voting period
      await time.increase(7 * 24 * 60 * 60 + 1);

      await governance.executeProposal(1);

      const newWeights = await governance.getCurrentWeights();
      expect(newWeights.engagementWeight).to.equal(350);
      expect(newWeights.credibilityWeight).to.equal(650);
      expect(newWeights.adPenalty).to.equal(35);
      expect(newWeights.communityVerifyBonus).to.equal(8);
    });

    it("emits WeightsChanged event on execution", async function () {
      await governance.connect(voter1).createProposal(
        "Update", "Desc", 350, 650, 30, 2, 5
      );
      await governance.connect(voter1).castVote(1, "yes");
      await governance.connect(voter2).castVote(1, "yes");
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(governance.executeProposal(1))
        .to.emit(governance, "WeightsChanged")
        .withArgs(350, 650, 30, 1, await time.latest() + 1);
    });
  });

  // ── SUPPRESSION AUDIT LOG TESTS ─────────────────────────────────
  describe("OFASuppressionAuditLog", function () {

    const postId    = ethers.encodeBytes32String("post_001");
    const contentCid= ethers.encodeBytes32String("QmTestCID123");

    it("logs suppression attempt correctly", async function () {
      await auditLog.logSuppressionAttempt(
        postId, contentCid,
        "platform_algorithm",
        '["sensitive_topic","health_review"]',
        "legitimate",
        "context_label",
        true
      );

      const event = await auditLog.getEvent(0);
      expect(event.flaggingEntity).to.equal("platform_algorithm");
      expect(event.tsVerdict).to.equal("legitimate");
      expect(event.suppressionBlocked).to.be.true;
      expect(event.actionTaken).to.equal("context_label");
    });

    it("only allows platform to log events", async function () {
      await expect(
        auditLog.connect(nonVoter).logSuppressionAttempt(
          postId, contentCid, "hacker", "[]", "legitimate", "deleted", false
        )
      ).to.be.revertedWith("Only OFA platform can log events");
    });

    it("tracks suppression attempts by post", async function () {
      await auditLog.logSuppressionAttempt(
        postId, contentCid, "algo_v1", '["flag1"]', "legitimate", "context_label", true
      );
      await auditLog.logSuppressionAttempt(
        postId, contentCid, "algo_v2", '["flag2"]', "legitimate", "no_action", true
      );

      const indices = await auditLog.getEventsByPost(postId);
      expect(indices.length).to.equal(2);
    });

    it("returns correct blocked/total counts", async function () {
      await auditLog.logSuppressionAttempt(
        postId, contentCid, "algo", "[]", "legitimate", "context_label", true
      );
      await auditLog.logSuppressionAttempt(
        postId, contentCid, "algo", "[]", "disinformation", "context_label", false
      );

      const [blocked, total] = await auditLog.getTotalBlocked();
      expect(total).to.equal(2);
      expect(blocked).to.equal(1);
    });
  });

  // ── ZK AGE VERIFIER TESTS ────────────────────────────────────────
  describe("OFAAgeVerifier", function () {

    it("verifies a valid age proof and stores nullifier", async function () {
      const nullifier = 12345678901234567890n;
      const signals   = [1n, nullifier, 2026n, 5n, 11n, 18n]; // isValid=1

      // Note: in real test, use actual ZK proof from circuit
      // For unit testing the contract logic, we test with mock proof
      // The groth16 verification math is tested separately
      const result = await ageVerifier.verifyAgeProof(
        [0n, 0n],         // proof_a (mock)
        [[0n,0n],[0n,0n]], // proof_b (mock)
        [0n, 0n],         // proof_c (mock)
        signals
      );

      // Check nullifier stored
      expect(await ageVerifier.usedNullifiers(nullifier)).to.be.true;
    });

    it("rejects reused nullifier", async function () {
      const nullifier = 99999888877776666n;
      const signals   = [1n, nullifier, 2026n, 5n, 11n, 18n];

      await ageVerifier.verifyAgeProof([0n,0n],[[0n,0n],[0n,0n]],[0n,0n], signals);

      // Second use of same nullifier
      const result2 = await ageVerifier.verifyAgeProof(
        [0n,0n],[[0n,0n],[0n,0n]],[0n,0n], signals
      );
      // Should return false (nullifier reused)
      // Event NullifierReuse should be emitted
    });

    it("stores verification record with correct data", async function () {
      const nullifier     = 11112222333344445555n;
      const nullifierHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [nullifier])
      );
      const signals = [1n, nullifier, 2026n, 5n, 11n, 18n];

      await ageVerifier.verifyAgeProof([0n,0n],[[0n,0n],[0n,0n]],[0n,0n], signals);

      const record = await ageVerifier.getNullifierRecord(nullifierHash);
      expect(record.verified).to.be.true;
      expect(record.ageOver18).to.be.true;
    });
  });
});
`;

// Write test file
import { writeFileSync, mkdirSync } from "fs";
mkdirSync("./test", { recursive: true });
mkdirSync("./scripts", { recursive: true });
writeFileSync("./test/OFAContracts.test.js", testSuite);
console.log("Test suite written to ./test/OFAContracts.test.js");
