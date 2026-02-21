/**
 * VotingFactory 行为与状态测试
 * 创建参数校验、getEffectiveState/canRegister/canVote/canRevealResult、延长截止、取消、onlyOwner
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  deployUnconfiguredCoreFixture,
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
      /InvalidParams|revert|fail/i
    );
  });

  it("创建时 options.length < 2 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, { options: ["仅一项"] });
    await assert.rejects(
      () => votingFactory.write.createVoting([params]),
      /InvalidParams|revert|fail/i
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
      /InvalidParams|revert|fail/i
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
      /InvalidParams|revert|fail/i
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
      /InvalidParams|revert|fail/i
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

  it("useBlockNumber=true 时状态应随区块高度推进", async function () {
    const startBlock = Number(await publicClient.getBlockNumber());
    const params = defaultCreateParams(startBlock, {
      useBlockNumber: true,
      registrationStart: BigInt(startBlock + 2),
      registrationEnd: BigInt(startBlock + 4),
      votingStart: BigInt(startBlock + 5),
      votingEnd: BigInt(startBlock + 7),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();

    // 这里只验证“Created 与 Registration 之间确实受区块高度驱动”，
    // 避免对 Voting/Tallying 阈值做过多假设。
    let state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 0, "初始应为 Created(0)");

    await networkHelpers.time.increase(1); // 出块 -> registrationStart 之后
    state = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(state, 1, "useBlockNumber 时应进入 Registration(1)");
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
      /OnlyOwner|Only owner|revert|fail/i
    );
  });

  it("匿名投票: 非 Open 注册或启用白名单 createVoting 应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const base = defaultCreateParams(now, {
      privacyLevel: PRIVACY_ANONYMOUS,
      votingRule: 0,
    });

    // 非 Open 注册
    const paramsApproval = {
      ...base,
      registrationRule: 1, // Approval
    };
    await assert.rejects(
      () => votingFactory.write.createVoting([paramsApproval]),
      /InvalidParams|revert|fail/i
    );

    // 启用白名单
    const paramsWhitelist = {
      ...base,
      enableWhitelist: true,
      whitelist: [deployer.account.address],
    };
    await assert.rejects(
      () => votingFactory.write.createVoting([paramsWhitelist]),
      /WhitelistNotSupported|InvalidParams|revert|fail/i
    );
  });

  it("加密/完全隐私投票: 未配置 EncryptedVoting 或阈值参数非法应 revert", async function () {
    const { votingFactory: coreOnly } = await deployUnconfiguredCoreFixture(conn);
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);

    // FullPrivacy 但未配置 EncryptedVoting
    const fullParams = defaultCreateParams(now, {
      privacyLevel: 3, // FullPrivacy
      votingRule: 0,
    });
    await assert.rejects(
      () => coreOnly.write.createVoting([fullParams]),
      /EncryptedNotConfigured|revert|fail/i
    );

    // Encrypted + 阈值解密但 committee 为空
    const { votingFactory: configuredFactory } = await deployPublicVotingFixture(conn);
    const encryptedParamsBadCommittee = defaultCreateParams(now, {
      privacyLevel: 2, // Encrypted
      votingRule: 0,
      useThresholdDecryption: true,
      thresholdCommittee: [] as readonly `0x${string}`[],
      thresholdT: 0,
    });
    await assert.rejects(
      () => configuredFactory.write.createVoting([encryptedParamsBadCommittee]),
      /ThresholdConfigInvalid|revert|fail/i
    );
  });

  it("未 setCenters 时 createVoting 应 revert（CentersNotConfigured）", async function () {
    const { votingFactory: coreOnly } = await deployUnconfiguredCoreFixture(conn);
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now);
    await assert.rejects(
      () => coreOnly.write.createVoting([params]),
      /CentersNotConfigured|revert|fail/i
    );
  });

  it("setCenters 只能调用一次，重复调用应 revert（AlreadySet）", async function () {
    // 使用 fixture 中已成功调用过 setCenters 的 votingFactory，再次调用应失败
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    void now; // 仅为保持与其他用例风格一致
    await assert.rejects(
      () =>
        votingFactory.write.setCenters([
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
        ]),
      /AlreadySet|revert|fail/i
    );
  });
});
