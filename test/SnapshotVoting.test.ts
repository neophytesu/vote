/**
 * 快照投票测试 - NFT/Token 按快照区块余额计资格与权重
 * 流程: 部署 MockERC20 -> 创建 TokenHolder 投票（快照 0 或指定区块）-> 注册 -> 投票 -> 揭示 -> 校验权重
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const VOTING_RULE_SIMPLE = 0;
const PRIVACY_PUBLIC = 0;
const REG_RULE_TOKEN_HOLDER = 3;

const createParamsBase = {
  title: "快照投票测试",
  description: "Token 持有者按快照余额计权重",
  options: ["选项A", "选项B"],
  votingRule: VOTING_RULE_SIMPLE,
  privacyLevel: PRIVACY_PUBLIC,
  enableWhitelist: false,
  whitelist: [] as readonly `0x${string}`[],
  whitelistGroupIndexes: [] as bigint[],
  weightGroupNames: [] as string[],
  weightGroupWeights: [] as bigint[],
  useBlockNumber: false,
  allowExtension: true,
  executionMode: 0,
  executionTarget: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  executionValue: 0n,
  executionCalldata: "0x" as `0x${string}`,
  executionOnWinningOption: 0n,
  executionMultisig: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  executionTimelockDelay: 0n,
  useThresholdDecryption: false,
  thresholdCommittee: [] as readonly `0x${string}`[],
  thresholdT: 0,
  revealDelay: 0n,
};

describe("SnapshotVoting", async function () {
  const conn = await network.connect("hardhat");
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  if (!walletClients?.[0] || !publicClient || !networkHelpers) {
    throw new Error("Missing viem clients or networkHelpers");
  }

  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  const voter2 = walletClients[2];
  if (!deployer || !voter1 || !voter2) throw new Error("Need at least 3 wallet clients");

  // 部署中心与工厂（不部署 Semaphore/Encrypted/Execution）
  const votingFactory = await viem.deployContract("VotingFactory", []);
  const registrationCenter = await viem.deployContract("RegistrationCenter", [votingFactory.address]);
  const votingCenter = await viem.deployContract("VotingCenter", [votingFactory.address, registrationCenter.address]);
  const revealCenter = await viem.deployContract("RevealCenter", [votingFactory.address]);
  const statisticsCenter = await viem.deployContract("StatisticsCenter", [votingFactory.address]);

  await votingFactory.write.setCenters([
    registrationCenter.address,
    votingCenter.address,
    revealCenter.address,
    statisticsCenter.address,
  ]);
  await viem.deployContract("QueryCenter", [votingFactory.address]);

  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const regStart = BigInt(now + 60);
  const regEnd = BigInt(now + 300);
  const voteStart = BigInt(now + 300);
  const voteEnd = BigInt(now + 600);

  it("应使用当前余额（快照=0）完成 TokenHolder 注册并按余额计票", async function () {
    const mockToken = await viem.deployContract("MockERC20Snapshot");
    await mockToken.write.mint([deployer.account.address, 100n * 10n ** 18n]);
    await mockToken.write.mint([voter1.account.address, 50n * 10n ** 18n]);

    const createParams = {
      ...createParamsBase,
      registrationStart: regStart,
      registrationEnd: regEnd,
      votingStart: voteStart,
      votingEnd: voteEnd,
      quorum: 0n,
      autoAdvance: true,
      visibilityBitmap: 0,
      registrationRule: REG_RULE_TOKEN_HOLDER,
      tokenContractAddress: mockToken.address as `0x${string}`,
      tokenMinBalance: 1n * 10n ** 18n,
      snapshotBlockNumber: 0n,
    };

    const hashCreate = await votingFactory.write.createVoting([createParams]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });
    const votingId = await votingFactory.read.votingCount();
    assert.ok(votingId > 0n, "votingId should be > 0");

    const balanceDeployer = await mockToken.read.balanceOf([deployer.account.address]);
    const balanceVoter1 = await mockToken.read.balanceOf([voter1.account.address]);
    assert.equal(balanceDeployer, 100n * 10n ** 18n, "deployer balance 100");
    assert.equal(balanceVoter1, 50n * 10n ** 18n, "voter1 balance 50");

    const snapshot0 = await votingFactory.read.getSnapshotBalance([votingId, deployer.account.address]);
    const snapshot1 = await votingFactory.read.getSnapshotBalance([votingId, voter1.account.address]);
    assert.equal(snapshot0, 100n * 10n ** 18n, "getSnapshotBalance(deployer) = 100");
    assert.equal(snapshot1, 50n * 10n ** 18n, "getSnapshotBalance(voter1) = 50");

    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }),
    });

    const weightDeployer = await registrationCenter.read.getVoterWeight([votingId, deployer.account.address]);
    const weightVoter1 = await registrationCenter.read.getVoterWeight([votingId, voter1.account.address]);
    assert.equal(weightDeployer, 100n * 10n ** 18n, "voter weight = balance (100)");
    assert.equal(weightVoter1, 50n * 10n ** 18n, "voter weight = balance (50)");

    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId, 1n], { account: voter1.account }),
    });

    const count0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const count1 = await votingCenter.read.voteCounts([votingId, 1n]);
    const total = await votingCenter.read.totalVotes([votingId]);
    assert.equal(count0, 100n * 10n ** 18n, "选项A 得 100 权重");
    assert.equal(count1, 50n * 10n ** 18n, "选项B 得 50 权重");
    assert.equal(total, 150n * 10n ** 18n, "总权重 150");

    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([votingId], { account: deployer.account });
    const state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 4, "应处于 Finalized(4)");
  });

  it("应使用快照区块（getPastVotes）按历史余额计资格与权重", async function () {
    const mockToken = await viem.deployContract("MockERC20Snapshot");
    await mockToken.write.mint([deployer.account.address, 200n * 10n ** 18n]);
    await mockToken.write.mint([voter1.account.address, 80n * 10n ** 18n]);

    const snapBlock = await publicClient.getBlockNumber();
    await mockToken.write.setPastBalance([deployer.account.address, snapBlock, 200n * 10n ** 18n]);
    await mockToken.write.setPastBalance([voter1.account.address, snapBlock, 80n * 10n ** 18n]);

    const now2 = Number((await publicClient.getBlock()).timestamp);
    const createParams = {
      ...createParamsBase,
      title: "快照区块投票",
      registrationStart: BigInt(now2 + 60),
      registrationEnd: BigInt(now2 + 300),
      votingStart: BigInt(now2 + 300),
      votingEnd: BigInt(now2 + 600),
      quorum: 0n,
      autoAdvance: true,
      visibilityBitmap: 0,
      registrationRule: REG_RULE_TOKEN_HOLDER,
      tokenContractAddress: mockToken.address as `0x${string}`,
      tokenMinBalance: 1n * 10n ** 18n,
      snapshotBlockNumber: snapBlock,
    };

    await votingFactory.write.createVoting([createParams]);
    const votingId2 = await votingFactory.read.votingCount();

    const past0 = await votingFactory.read.getSnapshotBalance([votingId2, deployer.account.address]);
    const past1 = await votingFactory.read.getSnapshotBalance([votingId2, voter1.account.address]);
    assert.equal(past0, 200n * 10n ** 18n, "快照余额 deployer 200");
    assert.equal(past1, 80n * 10n ** 18n, "快照余额 voter1 80");

    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId2], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId2], { account: voter1.account }),
    });

    const w0 = await registrationCenter.read.getVoterWeight([votingId2, deployer.account.address]);
    const w1 = await registrationCenter.read.getVoterWeight([votingId2, voter1.account.address]);
    assert.equal(w0, 200n * 10n ** 18n, "权重=快照 200");
    assert.equal(w1, 80n * 10n ** 18n, "权重=快照 80");

    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId2, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId2, 1n], { account: voter1.account }),
    });

    const c0 = await votingCenter.read.voteCounts([votingId2, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId2, 1n]);
    assert.equal(c0, 200n * 10n ** 18n, "选项0 得 200 权重");
    assert.equal(c1, 80n * 10n ** 18n, "选项1 得 80 权重");
  });

  it("余额不足时应拒绝注册", async function () {
    const mockToken = await viem.deployContract("MockERC20Snapshot");
    await mockToken.write.mint([deployer.account.address, 10n * 10n ** 18n]);
    const now3 = Number((await publicClient.getBlock()).timestamp);
    const createParams = {
      ...createParamsBase,
      title: "最低余额限制",
      registrationStart: BigInt(now3 + 60),
      registrationEnd: BigInt(now3 + 300),
      votingStart: BigInt(now3 + 300),
      votingEnd: BigInt(now3 + 600),
      quorum: 0n,
      autoAdvance: true,
      visibilityBitmap: 0,
      registrationRule: REG_RULE_TOKEN_HOLDER,
      tokenContractAddress: mockToken.address as `0x${string}`,
      tokenMinBalance: 100n * 10n ** 18n,
      snapshotBlockNumber: 0n,
    };
    await votingFactory.write.createVoting([createParams]);
    const votingId3 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await assert.rejects(
      () => votingFactory.write.registerVoter([votingId3], { account: voter2!.account }),
      /Insufficient token balance|revert|fail/i
    );
  });
});
