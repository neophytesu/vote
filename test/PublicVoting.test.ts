/**
 * 公开投票测试 - PrivacyLevel.Public 全流程
 * 覆盖：简单多数、加权投票、法定人数(quorum)、RevealCenter/QueryCenter 查询
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "./fixtures/deploy.js";

const VOTING_RULE_SIMPLE = 0;
const VOTING_RULE_WEIGHTED = 1;
const PRIVACY_PUBLIC = 0;

describe("PublicVoting", async function () {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    registrationCenter,
    votingCenter,
    revealCenter,
    queryCenter,
    statisticsCenter,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);

  const walletClients = (await conn.viem.getWalletClients())!;
  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  const voter2 = walletClients[2];
  if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

  it("应完成公开投票全流程：创建 -> 注册 -> 投票 -> 揭示 -> 校验结果", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now);
    const hashCreate = await votingFactory.write.createVoting([params]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });
    const votingId = await votingFactory.read.votingCount();
    assert.ok(votingId > 0n, "votingId should be > 0");

    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }),
    });

    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId, 1n], { account: voter1.account }),
    });

    await networkHelpers.time.increase(310);
    const stateTallying = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(stateTallying, 3, "应处于 Tallying(3)");

    const hashReveal = await votingFactory.write.revealResult([votingId], {
      account: deployer.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: hashReveal });

    const stateFinal = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(stateFinal, 4, "应处于 Finalized(4)");

    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId, 1n]);
    const total = await votingCenter.read.totalVotes([votingId]);
    assert.equal(c0, 1n, "选项0 应为 1 票");
    assert.equal(c1, 1n, "选项1 应为 1 票");
    assert.equal(total, 2n, "总票数应为 2");

    const revealed = await revealCenter.read.isResultRevealed([votingId]);
    assert.ok(revealed, "RevealCenter 应已揭示");
    const passed = await revealCenter.read.isProposalPassed([votingId]);
    assert.ok(passed, "应通过（quorum=0）");
    const [winningOption, winningVotes] = await revealCenter.read.getWinningOption([votingId]);
    assert.ok(winningOption === 0n || winningOption === 1n, "胜出选项应为 0 或 1（平局取首个）");
    assert.equal(winningVotes, 1n, "胜出选项票数为 1");
  });

  it("应支持公开加权投票：按权重计票", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "公开加权投票",
      options: ["A", "B"],
      votingRule: VOTING_RULE_WEIGHTED,
      weightGroupNames: ["普通", "高级"],
      weightGroupWeights: [1n, 3n],
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    const hashCreate = await votingFactory.write.createVoting([params]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });
    const votingId = await votingFactory.read.votingCount();

    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoterWeighted([votingId, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoterWeighted([votingId, 1n], {
        account: voter1.account,
      }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId, 0n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([votingId], { account: deployer.account });

    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const total = await votingCenter.read.totalVotes([votingId]);
    assert.equal(c0, 4n, "选项0 应为 1+3=4 票（权重）");
    assert.equal(total, 4n, "总票数 4");
  });

  it("应正确反映法定人数(quorum)：达到则通过，未达到则未通过", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const quorumReached = defaultCreateParams(now, {
      title: "quorum 通过",
      quorum: 2n,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    const hash1 = await votingFactory.write.createVoting([quorumReached]);
    await publicClient.waitForTransactionReceipt({ hash: hash1 });
    const vid1 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid1], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid1], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([vid1, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([vid1, 0n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([vid1], { account: deployer.account });
    const passed1 = await revealCenter.read.isProposalPassed([vid1]);
    assert.ok(passed1, "2 票 >= quorum 2 应通过");

    const now2 = Number((await publicClient.getBlock()).timestamp);
    const quorumNotReached = defaultCreateParams(now2, {
      title: "quorum 未通过",
      quorum: 10n,
      registrationStart: BigInt(now2 + 60),
      registrationEnd: BigInt(now2 + 180),
      votingStart: BigInt(now2 + 180),
      votingEnd: BigInt(now2 + 360),
    });
    await votingFactory.write.createVoting([quorumNotReached]);
    const vid2 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid2], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid2], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([vid2, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([vid2, 0n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([vid2], { account: deployer.account });
    const passed2 = await revealCenter.read.isProposalPassed([vid2]);
    assert.equal(passed2, false, "2 票 < quorum 10 应未通过");
  });

  it("RevealCenter: 重复 revealResult 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "防重复揭示",
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([votingId], { account: deployer.account });
    await assert.rejects(
      () =>
        votingFactory.write.revealResult([votingId], { account: deployer.account }),
      /Cannot reveal|Invalid state|Result already revealed|revert|fail/i
    );
  });

  it("QueryCenter: getVoting 与各中心数据一致", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "QueryCenter 校验",
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId, 1n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([votingId], { account: deployer.account });

    const details = await queryCenter.read.getVoting([votingId]);
    assert.equal(details.id, votingId, "id");
    assert.equal(details.totalVoters, 2n, "totalVoters");
    assert.equal(details.totalVotes, 2n, "totalVotes");
    assert.equal(details.resultRevealed, true, "resultRevealed");
    assert.equal(details.state, 4, "Finalized");
    assert.equal(details.voteCounts.length, 2, "voteCounts length");
    assert.equal(details.voteCounts[0], 1n, "voteCounts[0]");
    assert.equal(details.voteCounts[1], 1n, "voteCounts[1]");
  });

  it("QueryCenter: getVotingsByCreator 返回创建者的投票列表", async function () {
    const creatorVotings = await queryCenter.read.getVotingsByCreator([deployer.account.address]);
    assert.ok(Array.isArray(creatorVotings), "应返回数组");
    assert.ok(creatorVotings.length >= 1n, "至少包含本 describe 中创建的投票");
  });

  it("StatisticsCenter: 创建并完成投票后应有统计记录", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "统计中心校验",
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId, 0n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([votingId], { account: deployer.account });

    const votingStats = await statisticsCenter.read.getVotingStats([votingId]);
    assert.ok(votingStats.createdAt > 0n, "该投票应有统计记录");
    assert.equal(votingStats.registrationCount, 2n, "注册人数应为 2");
    assert.equal(votingStats.voteCount, 2n, "投票人数应为 2");
    const globalStats = await statisticsCenter.read.getGlobalStats();
    assert.ok(Number(globalStats.completedVotings) >= 1, "至少 1 个已完成投票");
  });
});
