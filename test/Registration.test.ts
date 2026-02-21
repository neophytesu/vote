/**
 * 注册规则测试 - 白名单与审核模式
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "./fixtures/deploy.js";

const REG_RULE_OPEN = 0;
const REG_RULE_APPROVAL = 1;
const PRIVACY_ANONYMOUS = 1;
const PRIVACY_ENCRYPTED = 2;

describe("Registration", async function () {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    registrationCenter,
    votingCenter,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);

  const walletClients = (await conn.viem.getWalletClients())!;
  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  const voter2 = walletClients[2];
  if (!deployer || !voter1 || !voter2) throw new Error("Need at least 3 wallet clients");

  it("白名单：创建时传入 whitelist 后白名单地址无需 registerVoter 即可投票", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "白名单投票",
      enableWhitelist: true,
      whitelist: [voter1.account.address, voter2.account.address],
      whitelistGroupIndexes: [] as bigint[],
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();

    const reg1 = await registrationCenter.read.isRegistered([votingId, voter1.account.address]);
    const reg2 = await registrationCenter.read.isRegistered([votingId, voter2.account.address]);
    assert.ok(reg1, "voter1 应在白名单中已注册");
    assert.ok(reg2, "voter2 应在白名单中已注册");

    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: voter1.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.castVote([votingId, 1n], { account: voter2.account }),
    });

    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId, 1n]);
    assert.equal(c0, 1n, "选项0 应 1 票");
    assert.equal(c1, 1n, "选项1 应 1 票");
  });

  it("审核模式：用户 registerVoter 进入待审核，创建者 approve 后可投票", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "审核模式投票",
      registrationRule: REG_RULE_APPROVAL,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);

    await votingFactory.write.registerVoter([votingId], { account: voter1.account });
    let pending = await registrationCenter.read.isPending([votingId, voter1.account.address]);
    assert.ok(pending, "voter1 应在待审核");
    let reg = await registrationCenter.read.isRegistered([votingId, voter1.account.address]);
    assert.equal(reg, false, "审核前未注册");

    await votingFactory.write.approveRegistration([votingId, voter1.account.address], {
      account: deployer.account,
    });
    pending = await registrationCenter.read.isPending([votingId, voter1.account.address]);
    reg = await registrationCenter.read.isRegistered([votingId, voter1.account.address]);
    assert.equal(pending, false, "审核后应不在待审核");
    assert.ok(reg, "审核后应已注册");

    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: voter1.account });
    const total = await votingCenter.read.totalVotes([votingId]);
    assert.equal(total, 1n, "应成功投 1 票");
  });

  it("审核模式：创建者 reject 后该地址不可投票", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "审核拒绝测试",
      registrationRule: REG_RULE_APPROVAL,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);

    await votingFactory.write.registerVoter([votingId], { account: voter2.account });
    await votingFactory.write.rejectRegistration([votingId, voter2.account.address], {
      account: deployer.account,
    });
    const reg = await registrationCenter.read.isRegistered([votingId, voter2.account.address]);
    assert.equal(reg, false, "拒绝后未注册");

    await networkHelpers.time.increase(250);
    await assert.rejects(
      () => votingFactory.write.castVote([votingId, 0n], { account: voter2.account }),
      /Not registered|revert|fail/i
    );
  });

  it("匿名/加密投票: 启用白名单或非 Open 注册在 createVoting 阶段应 revert", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);

    // 匿名 + 审核模式
    const paramsAnonymousApproval = defaultCreateParams(now, {
      title: "匿名+审核",
      privacyLevel: PRIVACY_ANONYMOUS,
      registrationRule: REG_RULE_APPROVAL,
    });
    await assert.rejects(
      () => votingFactory.write.createVoting([paramsAnonymousApproval]),
      /InvalidParams|revert|fail/i
    );

    // 加密 + 白名单
    const paramsEncryptedWhitelist = defaultCreateParams(now, {
      title: "加密+白名单",
      privacyLevel: PRIVACY_ENCRYPTED,
      enableWhitelist: true,
      whitelist: [voter1.account.address],
    });
    await assert.rejects(
      () => votingFactory.write.createVoting([paramsEncryptedWhitelist]),
      /WhitelistNotSupported|InvalidParams|revert|fail/i
    );
  });
});
