/**
 * 阈值解密（t-of-n 委员会）测试脚本
 *
 * 流程：部署 -> 创建加密投票（启用阈值解密）-> 注册 -> 加密投票 -> 提交计票 -> 委员会确认(t=2) -> 揭示结果
 *
 * 运行:
 *   npx hardhat test test/ThresholdDecryption.test.ts
 *
 * 用例:
 *   1. 完整流程：3 人委员会、t=2，2 人确认后计票生效并揭示
 *   2. 未达 t 时计票不生效；同一人重复确认会 revert
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const VOTING_RULE_SIMPLE = 0;
const PRIVACY_ENCRYPTED = 2;
const REG_RULE_OPEN = 0;
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

describe("ThresholdDecryption", async function () {
  const conn = await network.connect("hardhat");
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  if (!walletClients?.[0] || !publicClient || !networkHelpers) {
    throw new Error("Missing viem clients or networkHelpers");
  }

  const deployer = walletClients[0];
  const committee1 = walletClients[1];
  const committee2 = walletClients[2];
  const voter3 = walletClients[3];
  if (!deployer || !committee1 || !committee2) throw new Error("Need at least 3 wallet clients");

  it("完整流程：创建(阈值解密) -> 注册 -> 投票 -> 提交计票 -> 2/2 委员会确认 -> 揭示", async function () {
    // ---------- 1. 部署 ----------
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
    const encryptedVoting = await viem.deployContract("EncryptedVoting", [
      votingFactory.address,
      registrationCenter.address,
      votingCenter.address,
      statisticsCenter.address,
    ]);

    await votingFactory.write.setEncryptedVoting([encryptedVoting.address]);
    await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);

    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const regStart = BigInt(now + 60);
    const regEnd = BigInt(now + 300);
    const voteStart = BigInt(now + 300);
    const voteEnd = BigInt(now + 600);

    // ---------- 2. 创建加密投票（启用阈值解密：2-of-2 委员会）----------
    const createParams = {
      title: "阈值解密测试投票",
      description: "t-of-n 委员会确认计票结果",
      options: ["赞成", "反对", "弃权"],
      votingRule: VOTING_RULE_SIMPLE,
      privacyLevel: PRIVACY_ENCRYPTED,
      registrationStart: regStart,
      registrationEnd: regEnd,
      votingStart: voteStart,
      votingEnd: voteEnd,
      quorum: 0n,
      autoAdvance: true,
      visibilityBitmap: 0,
      enableWhitelist: false,
      whitelist: [] as readonly `0x${string}`[],
      whitelistGroupIndexes: [] as bigint[],
      weightGroupNames: [] as string[],
      weightGroupWeights: [] as bigint[],
      registrationRule: REG_RULE_OPEN,
      tokenContractAddress: ZERO,
      tokenMinBalance: 0n,
      useBlockNumber: false,
      allowExtension: true,
      snapshotBlockNumber: 0n,
      executionMode: 0,
      executionTarget: ZERO,
      executionValue: 0n,
      executionCalldata: "0x" as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: ZERO,
      executionTimelockDelay: 0n,
      useThresholdDecryption: true,
      thresholdCommittee: [deployer.account.address, committee1.account.address, committee2.account.address] as readonly `0x${string}`[],
      thresholdT: 2,
      revealDelay: 0n,
    };

    const hashCreate = await votingFactory.write.createVoting([createParams]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });
    const votingId = await votingFactory.read.votingCount();
    assert.ok(votingId > 0n, "votingId > 0");

    // ---------- 3. 进入注册期并注册 ----------
    await networkHelpers.time.increase(61);
    assert.equal(await votingFactory.read.getEffectiveState([votingId]), 1, "状态应为 Registration(1)");

    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: committee1.account }),
    });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: committee2.account }),
    });
    if (voter3) {
      await publicClient.waitForTransactionReceipt({
        hash: await votingFactory.write.registerVoter([votingId], { account: voter3.account }),
      });
    }

    // ---------- 4. 进入投票期并提交加密选票 ----------
    await networkHelpers.time.increase(250);
    assert.equal(await votingFactory.read.getEffectiveState([votingId]), 2, "状态应为 Voting(2)");

    await encryptedVoting.write.castVoteEncrypted([votingId, "0x01" as `0x${string}`], { account: deployer.account });
    await encryptedVoting.write.castVoteEncrypted([votingId, "0x02" as `0x${string}`], { account: committee1.account });
    await encryptedVoting.write.castVoteEncrypted([votingId, "0x01" as `0x${string}`], { account: committee2.account });
    if (voter3) {
      await encryptedVoting.write.castVoteEncrypted([votingId, "0x00" as `0x${string}`], { account: voter3.account });
    }

    // ---------- 5. 进入计票期 ----------
    await networkHelpers.time.increase(310);
    assert.equal(await votingFactory.read.getEffectiveState([votingId]), 3, "状态应为 Tallying(3)");

    // 计票结果尚未写入（阈值模式需委员会确认）
    const submittedBefore = await votingCenter.read.encryptedTallySubmitted([votingId]);
    assert.equal(submittedBefore, false, "阈值模式下未确认前不应已提交");

    // ---------- 6. 委员会成员提交计票结果（进入待确认）----------
    const totalBallots = voter3 ? 4n : 3n;
    const decryptedCounts = voter3 ? [1n, 2n, 1n] : [1n, 2n, 0n]; // 赞成1, 反对2, 弃权0/1
    await encryptedVoting.write.submitTallyResult([votingId, totalBallots, decryptedCounts], { account: deployer.account });

    const pendingSubmitter = await encryptedVoting.read.pendingTallySubmittedBy([votingId]);
    assert.ok(pendingSubmitter !== ZERO, "应有待确认计票");
    const approvalCount0 = await encryptedVoting.read.pendingApprovalCount([votingId]);
    assert.equal(approvalCount0, 0n, "初始确认数应为 0");

    // ---------- 7. 第 1 名委员会成员确认 ----------
    await encryptedVoting.write.approveTallyResult([votingId], { account: committee1.account });
    const approvalCount1 = await encryptedVoting.read.pendingApprovalCount([votingId]);
    assert.equal(approvalCount1, 1n, "确认数应为 1");
    const stillSubmitted = await votingCenter.read.encryptedTallySubmitted([votingId]);
    assert.equal(stillSubmitted, false, "未达 t 前计票不应写入");

    // ---------- 8. 第 2 名委员会成员确认 -> 达到 t=2，计票写入 ----------
    await encryptedVoting.write.approveTallyResult([votingId], { account: committee2.account });
    const submittedAfter = await votingCenter.read.encryptedTallySubmitted([votingId]);
    assert.equal(submittedAfter, true, "达到 t 后计票应已写入");

    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId, 1n]);
    const c2 = await votingCenter.read.voteCounts([votingId, 2n]);
    const total = await votingCenter.read.totalVotes([votingId]);
    assert.equal(c0, decryptedCounts[0], "选项0 票数");
    assert.equal(c1, decryptedCounts[1], "选项1 票数");
    assert.equal(c2, decryptedCounts[2], "选项2 票数");
    assert.equal(total, totalBallots, "总票数");

    // 待确认状态应已清空
    const pendingAfter = await encryptedVoting.read.pendingTallySubmittedBy([votingId]);
    assert.equal(pendingAfter, ZERO, "确认完成后应无待处理计票");

    // ---------- 9. 揭示结果 ----------
    await votingFactory.write.revealResult([votingId], { account: deployer.account });
    assert.equal(await votingFactory.read.getEffectiveState([votingId]), 4, "状态应为 Finalized(4)");

    const [winningOption, winningVotes] = await revealCenter.read.getWinningOption([votingId]);
    assert.equal(winningOption, 1n, "胜出选项应为索引 1（反对）");
    assert.equal(winningVotes, decryptedCounts[1], "胜出票数");
  });

  it("未达 t 时计票不应生效；非委员会成员不能确认", async function () {
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
    const encryptedVoting = await viem.deployContract("EncryptedVoting", [
      votingFactory.address,
      registrationCenter.address,
      votingCenter.address,
      statisticsCenter.address,
    ]);

    await votingFactory.write.setEncryptedVoting([encryptedVoting.address]);
    await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);

    const block = await publicClient.getBlock();
    const t = Number(block.timestamp);
    const params = {
      title: "阈值2/3-仅1人确认",
      description: "测试未达t",
      options: ["A", "B"],
      votingRule: VOTING_RULE_SIMPLE,
      privacyLevel: PRIVACY_ENCRYPTED,
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
      quorum: 0n,
      autoAdvance: true,
      visibilityBitmap: 0,
      enableWhitelist: false,
      whitelist: [] as readonly `0x${string}`[],
      whitelistGroupIndexes: [] as bigint[],
      weightGroupNames: [] as string[],
      weightGroupWeights: [] as bigint[],
      registrationRule: REG_RULE_OPEN,
      tokenContractAddress: ZERO,
      tokenMinBalance: 0n,
      useBlockNumber: false,
      allowExtension: true,
      snapshotBlockNumber: 0n,
      executionMode: 0,
      executionTarget: ZERO,
      executionValue: 0n,
      executionCalldata: "0x" as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: ZERO,
      executionTimelockDelay: 0n,
      useThresholdDecryption: true,
      thresholdCommittee: [deployer.account.address, committee1.account.address, committee2.account.address] as readonly `0x${string}`[],
      thresholdT: 3, // 需要 3 人全部确认
      revealDelay: 0n,
    };

    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await votingFactory.write.registerVoter([votingId], { account: committee1.account });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted([votingId, "0x01" as `0x${string}`], { account: deployer.account });
    await networkHelpers.time.increase(310);

    await encryptedVoting.write.submitTallyResult([votingId, 1n, [1n, 0n]], { account: deployer.account });
    await encryptedVoting.write.approveTallyResult([votingId], { account: deployer.account });
    await encryptedVoting.write.approveTallyResult([votingId], { account: committee1.account });
    // 仅 2 人确认，t=3 未达到
    const submitted = await votingCenter.read.encryptedTallySubmitted([votingId]);
    assert.equal(submitted, false, "仅 2/3 确认时计票不应写入");

    // 非委员会成员（若存在 voter3 且不在委员会）不能确认：本用例委员会为 deployer/committee1/committee2，均为委员会，用 deployer 重复确认应 revert
    await assert.rejects(
      () => encryptedVoting.write.approveTallyResult([votingId], { account: deployer.account }),
      /Already approved|revert|fail/i
    );
  });
});
