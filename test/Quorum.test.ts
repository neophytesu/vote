/**
 * 法定人数（quorum）测试 - 对四种投票规则分别验证达到/未达到法定人数时 passed 结果
 * 运行: npx hardhat test test/Quorum.test.ts
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
const VOTING_RULE_QUADRATIC = 2;
const VOTING_RULE_RANKED_CHOICE = 3;
const PRIVACY_PUBLIC = 0;

describe("Quorum - 法定人数", async function () {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    votingCenter,
    revealCenter,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);

  const walletClients = (await conn.viem.getWalletClients())!;
  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  const voter2 = walletClients[2];
  if (!deployer || !voter1 || !voter2) throw new Error("Need at least 3 wallet clients");

  /** 推进时间并完成注册、投票、揭示的通用步骤（时间偏移与投票行为由调用方通过 afterReg/afterVote 控制） */
  async function advanceAndReveal(votingId: bigint, account = deployer!.account) {
    await networkHelpers.time.increase(310);
    await votingFactory.write.revealResult([votingId], { account });
  }

  it("简单多数：达到法定人数则 passed，未达到则未通过", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const base = {
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    };

    // quorum=2，2 人各投 1 票 -> totalVotes=2 >= 2 -> passed
    const paramsReached = defaultCreateParams(now, {
      title: "简单多数 quorum 通过",
      quorum: 2n,
      ...base,
    });
    await votingFactory.write.createVoting([paramsReached]);
    const vid1 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid1], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid1], { account: voter1!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([vid1, 0n], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([vid1, 1n], { account: voter1!.account }),
    });
    await advanceAndReveal(vid1);
    const passed1 = await revealCenter.read.isProposalPassed([vid1]);
    assert.ok(passed1, "简单多数：2 票 >= quorum 2 应通过");

    // quorum=10，仍只有 2 票 -> 未通过
    const now2 = Number((await publicClient.getBlock()).timestamp);
    const paramsNotReached = defaultCreateParams(now2, {
      title: "简单多数 quorum 未通过",
      quorum: 10n,
      ...base,
      registrationStart: BigInt(now2 + 60),
      registrationEnd: BigInt(now2 + 180),
      votingStart: BigInt(now2 + 180),
      votingEnd: BigInt(now2 + 360),
    });
    await votingFactory.write.createVoting([paramsNotReached]);
    const vid2 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid2], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid2], { account: voter1!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([vid2, 0n], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([vid2, 0n], { account: voter1!.account }),
    });
    await advanceAndReveal(vid2);
    const passed2 = await revealCenter.read.isProposalPassed([vid2]);
    assert.equal(passed2, false, "简单多数：2 票 < quorum 10 应未通过");
  });

  it("加权投票：加权总票数达到法定人数则 passed", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const base = {
      title: "加权 quorum",
      options: ["A", "B"],
      votingRule: VOTING_RULE_WEIGHTED,
      weightGroupNames: ["普通", "高级"],
      weightGroupWeights: [1n, 3n],
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    };

    // quorum=4：deployer 权重 1，voter1 权重 3 -> 总加权票 4 -> passed
    const paramsReached = defaultCreateParams(now, { ...base, quorum: 4n });
    await votingFactory.write.createVoting([paramsReached]);
    const vid1 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoterWeighted([vid1, 0n], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoterWeighted([vid1, 1n], { account: voter1!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([vid1, 0n], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([vid1, 0n], { account: voter1!.account }),
    });
    await advanceAndReveal(vid1);
    const passed1 = await revealCenter.read.isProposalPassed([vid1]);
    assert.ok(passed1, "加权：总加权票 4 >= quorum 4 应通过");

    // quorum=5：总加权票仍 4 -> 未通过
    const now2 = Number((await publicClient.getBlock()).timestamp);
    const paramsNotReached = defaultCreateParams(now2, {
      ...base,
      quorum: 5n,
      registrationStart: BigInt(now2 + 60),
      registrationEnd: BigInt(now2 + 180),
      votingStart: BigInt(now2 + 180),
      votingEnd: BigInt(now2 + 360),
    });
    await votingFactory.write.createVoting([paramsNotReached]);
    const vid2 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoterWeighted([vid2, 0n], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoterWeighted([vid2, 1n], { account: voter1!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([vid2, 0n], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([vid2, 0n], { account: voter1!.account }),
    });
    await advanceAndReveal(vid2);
    const passed2 = await revealCenter.read.isProposalPassed([vid2]);
    assert.equal(passed2, false, "加权：总加权票 4 < quorum 5 应未通过");
  });

  it("二次方投票：总票数达到法定人数则 passed", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const base = {
      title: "二次方 quorum",
      options: ["A", "B"],
      votingRule: VOTING_RULE_QUADRATIC,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    };

    // quorum=5：voter1 投 [0]=3（成本 9），voter2 投 [0]=2（成本 4），总票数 3+2=5 -> passed
    const paramsReached = defaultCreateParams(now, { ...base, quorum: 5n });
    await votingFactory.write.createVoting([paramsReached]);
    const vid1 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid1], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid1], { account: voter1!.account }),
    });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid1], { account: voter2!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castQuadraticVote([vid1, [0n], [3n]], { account: voter1!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castQuadraticVote([vid1, [0n], [2n]], { account: voter2!.account }),
    });
    await advanceAndReveal(vid1);
    const total1 = await votingCenter.read.totalVotes([vid1]);
    assert.equal(total1, 5n, "二次方：总票数应为 5");
    const passed1 = await revealCenter.read.isProposalPassed([vid1]);
    assert.ok(passed1, "二次方：总票数 5 >= quorum 5 应通过");

    // quorum=10：总票数仍 5 -> 未通过
    const now2 = Number((await publicClient.getBlock()).timestamp);
    const paramsNotReached = defaultCreateParams(now2, {
      ...base,
      quorum: 10n,
      registrationStart: BigInt(now2 + 60),
      registrationEnd: BigInt(now2 + 180),
      votingStart: BigInt(now2 + 180),
      votingEnd: BigInt(now2 + 360),
    });
    await votingFactory.write.createVoting([paramsNotReached]);
    const vid2 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid2], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid2], { account: voter1!.account }),
    });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid2], { account: voter2!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castQuadraticVote([vid2, [0n], [3n]], { account: voter1!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castQuadraticVote([vid2, [0n], [2n]], { account: voter2!.account }),
    });
    await advanceAndReveal(vid2);
    const passed2 = await revealCenter.read.isProposalPassed([vid2]);
    assert.equal(passed2, false, "二次方：总票数 5 < quorum 10 应未通过");
  });

  it("排序选择：参与人数达到法定人数则 passed", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const base = {
      title: "排序选择 quorum",
      options: ["A", "B"],
      votingRule: VOTING_RULE_RANKED_CHOICE,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    };

    // quorum=2：2 人投排序，totalVotes=2 -> passed
    const paramsReached = defaultCreateParams(now, { ...base, quorum: 2n });
    await votingFactory.write.createVoting([paramsReached]);
    const vid1 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid1], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid1], { account: voter1!.account }),
    });
    await networkHelpers.time.increase(250);
    // rankedOptions: [0, 1] = 首选 A 次选 B；[1, 0] = 首选 B 次选 A
    await votingFactory.write.castRankedVote([vid1, [0n, 1n]], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castRankedVote([vid1, [1n, 0n]], { account: voter1!.account }),
    });
    await advanceAndReveal(vid1);
    const passed1 = await revealCenter.read.isProposalPassed([vid1]);
    assert.ok(passed1, "排序选择：2 人参与 >= quorum 2 应通过");

    // quorum=10：仍 2 人 -> 未通过
    const now2 = Number((await publicClient.getBlock()).timestamp);
    const paramsNotReached = defaultCreateParams(now2, {
      ...base,
      quorum: 10n,
      registrationStart: BigInt(now2 + 60),
      registrationEnd: BigInt(now2 + 180),
      votingStart: BigInt(now2 + 180),
      votingEnd: BigInt(now2 + 360),
    });
    await votingFactory.write.createVoting([paramsNotReached]);
    const vid2 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([vid2], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([vid2], { account: voter1!.account }),
    });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castRankedVote([vid2, [0n, 1n]], { account: deployer!.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castRankedVote([vid2, [1n, 0n]], { account: voter1!.account }),
    });
    await advanceAndReveal(vid2);
    const passed2 = await revealCenter.read.isProposalPassed([vid2]);
    assert.equal(passed2, false, "排序选择：2 人参与 < quorum 10 应未通过");
  });
});
