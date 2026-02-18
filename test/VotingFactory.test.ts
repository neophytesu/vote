/**
 * VotingFactory 行为与状态测试
 * 创建参数校验、getEffectiveState/canRegister/canVote/canRevealResult、延长截止、取消、onlyOwner
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "./fixtures/deploy.js";

const PRIVACY_PUBLIC = 0;
const PRIVACY_ANONYMOUS = 1;
const REG_RULE_OPEN = 0;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

describe("VotingFactory", async function () {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);

  const walletClients = (await conn.viem.getWalletClients())!;
  const deployer = walletClients[0];
  const other = walletClients[1];
  if (!deployer || !other) throw new Error("Need at least 2 wallet clients");

  it("创建时 title 为空应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, { title: "" });
    await assert.rejects(
      () => votingFactory.write.createVoting([params]),
      /Title required|revert|fail/i
    );
  });

  it("创建时 options.length < 2 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, { options: ["仅一项"] });
    await assert.rejects(
      () => votingFactory.write.createVoting([params]),
      /At least 2 options|revert|fail/i
    );
  });

  it("创建时 registrationEnd <= registrationStart 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      registrationStart: BigInt(now + 100),
      registrationEnd: BigInt(now + 100),
      votingStart: BigInt(now + 200),
      votingEnd: BigInt(now + 300),
    });
    await assert.rejects(
      () => votingFactory.write.createVoting([params]),
      /Invalid registration period|revert|fail/i
    );
  });

  it("创建时 votingEnd <= votingStart 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      votingStart: BigInt(now + 400),
      votingEnd: BigInt(now + 400),
    });
    await assert.rejects(
      () => votingFactory.write.createVoting([params]),
      /Invalid voting period|revert|fail/i
    );
  });

  it("创建时 votingStart < registrationEnd 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 300),
      votingStart: BigInt(now + 200),
      votingEnd: BigInt(now + 400),
    });
    await assert.rejects(
      () => votingFactory.write.createVoting([params]),
      /Voting must start after registration|revert|fail/i
    );
  });

  it("getEffectiveState 应随时间推进为 Created -> Registration -> Voting -> Tallying", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now);
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();

    let state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 0, "初始应为 Created(0)");

    await networkHelpers.time.increase(61);
    state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 1, "应在 Registration(1)");

    const canReg = await votingFactory.read.canRegister([votingId]);
    assert.ok(canReg, "canRegister 应为 true");

    await networkHelpers.time.increase(250);
    state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 2, "应在 Voting(2)");

    const canVote = await votingFactory.read.canVote([votingId]);
    assert.ok(canVote, "canVote 应为 true");

    await networkHelpers.time.increase(310);
    state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 3, "应在 Tallying(3)");

    const canReveal = await votingFactory.read.canRevealResult([votingId]);
    assert.ok(canReveal, "canRevealResult 应为 true");
  });

  it("allowExtension 下 extendRegistrationEnd 应生效且仅创建者可调", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "延长注册测试",
      autoAdvance: false,
      allowExtension: true,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await votingFactory.write.startRegistration([votingId], { account: deployer.account });

    const newEnd = BigInt(now + 250);
    await votingFactory.write.extendRegistrationEnd([votingId, newEnd], {
      account: deployer.account,
    });
    const info = await votingFactory.read.getVotingRaw([votingId]);
    assert.equal(info.registrationEnd, newEnd, "registrationEnd 应已更新");

    await assert.rejects(
      () =>
        votingFactory.write.extendRegistrationEnd([votingId, newEnd + 1n], {
          account: other.account,
        }),
      /Not authorized|revert|fail/i
    );
  });

  it("allowExtension 下 extendVotingEnd 应生效且仅创建者可调", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "延长投票测试",
      autoAdvance: false,
      allowExtension: true,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await votingFactory.write.startRegistration([votingId], { account: deployer.account });
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await votingFactory.write.startVoting([votingId], { account: deployer.account });

    const newVoteEnd = BigInt(now + 400);
    await votingFactory.write.extendVotingEnd([votingId, newVoteEnd], {
      account: deployer.account,
    });
    const info = await votingFactory.read.getVotingRaw([votingId]);
    assert.equal(info.votingEnd, newVoteEnd, "votingEnd 应已更新");
  });

  it("cancelVoting 仅创建者或 owner 可调且仅在 Created/Registration/Voting 可取消", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "取消测试",
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();

    await votingFactory.write.cancelVoting([votingId], { account: deployer.account });
    const state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 5, "应为 Cancelled(5)");

    await assert.rejects(
      () => votingFactory.write.registerVoter([votingId], { account: deployer.account }),
      /revert|fail|Invalid state|Registration not open/i
    );
  });

  it("非创建者取消应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "仅创建者可取消",
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();

    await assert.rejects(
      () => votingFactory.write.cancelVoting([votingId], { account: other.account }),
      /Not authorized|revert|fail/i
    );
  });

  it("onlyOwner: setAnonymousVoting 非 owner 调用应 revert", async function () {
    await assert.rejects(
      () =>
        votingFactory.write.setAnonymousVoting([other.account.address], {
          account: other.account,
        }),
      /Only owner|revert|fail/i
    );
  });
});
