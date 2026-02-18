/**
 * 加密投票测试
 * 流程: 部署 -> 创建加密投票 -> 注册选民 -> 提交加密选票 -> 提交解密结果 -> 揭示结果
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

// VotingRule: SimpleMajority=0, Weighted=1, Quadratic=2, RankedChoice=3
// PrivacyLevel: Public=0, Anonymous=1, Encrypted=2, FullPrivacy=3
// RegistrationRule: Open=0
const VOTING_RULE_SIMPLE = 0;
const VOTING_RULE_WEIGHTED = 1;
const VOTING_RULE_QUADRATIC = 2;
const VOTING_RULE_RANKED_CHOICE = 3;
const PRIVACY_ENCRYPTED = 2;
const REG_RULE_OPEN = 0;

const VOTING_FACTORY_CREATE_ABI = [
  {
    type: "function",
    name: "createVoting",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "options", type: "string[]" },
          { name: "votingRule", type: "uint8" },
          { name: "privacyLevel", type: "uint8" },
          { name: "registrationStart", type: "uint256" },
          { name: "registrationEnd", type: "uint256" },
          { name: "votingStart", type: "uint256" },
          { name: "votingEnd", type: "uint256" },
          { name: "quorum", type: "uint256" },
          { name: "autoAdvance", type: "bool" },
          { name: "visibilityBitmap", type: "uint16" },
          { name: "enableWhitelist", type: "bool" },
          { name: "whitelist", type: "address[]" },
          { name: "whitelistGroupIndexes", type: "uint256[]" },
          { name: "weightGroupNames", type: "string[]" },
          { name: "weightGroupWeights", type: "uint256[]" },
          { name: "registrationRule", type: "uint8" },
          { name: "tokenContractAddress", type: "address" },
          { name: "tokenMinBalance", type: "uint256" },
          { name: "useBlockNumber", type: "bool" },
          { name: "allowExtension", type: "bool" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "votingCount",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getEffectiveState",
    inputs: [{ name: "votingId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "registerVoter",
    inputs: [{ name: "votingId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "registerVoterWeighted",
    inputs: [
      { name: "votingId", type: "uint256" },
      { name: "groupIndex", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revealResult",
    inputs: [{ name: "votingId", type: "uint256" }],
    outputs: [],
  },
] as const;

const VOTING_CENTER_ABI = [
  {
    type: "function",
    name: "voteCounts",
    inputs: [
      { name: "proposalId", type: "uint256" },
      { name: "optionIndex", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalVotes",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "encryptedTallySubmitted",
    inputs: [{ name: "proposalId", type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;

describe("EncryptedVoting", async function () {
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
  if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

  // 部署（不依赖 Semaphore）
  const registrationCenter = await viem.deployContract("RegistrationCenter");
  const votingCenter = await viem.deployContract("VotingCenter");
  const revealCenter = await viem.deployContract("RevealCenter");
  const statisticsCenter = await viem.deployContract("StatisticsCenter");
  const votingFactory = await viem.deployContract("VotingFactory", [
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

  await viem.deployContract("QueryCenter", [votingFactory.address]);

  // 配置
  await registrationCenter.write.setVotingCore([votingFactory.address]);
  await votingCenter.write.setVotingCore([votingFactory.address]);
  await votingCenter.write.setRegistrationCenter([registrationCenter.address]);
  const hashSetEncrypted = await votingFactory.write.setEncryptedVoting([encryptedVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: hashSetEncrypted });
  await revealCenter.write.setVotingCore([votingFactory.address]);
  await statisticsCenter.write.setAuthorizedCaller([votingFactory.address]);
  await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);

  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const regStart = BigInt(now + 60);
  const regEnd = BigInt(now + 300);
  const voteStart = BigInt(now + 300);
  const voteEnd = BigInt(now + 600);

  const createParamsSimple = {
    title: "加密投票测试-简单多数",
    description: "测试加密投票流程",
    options: ["选项A", "选项B"],
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
    tokenContractAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    tokenMinBalance: 0n,
    useBlockNumber: false,
    allowExtension: true,
    snapshotBlockNumber: 0n,
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

  it("应成功创建加密投票（简单多数）", async function () {
    const hashCreate = await votingFactory.write.createVoting([createParamsSimple]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });
    const count = await votingFactory.read.votingCount();
    assert.ok(count > 0n, "votingId should be > 0");
  });

  it("应完成注册 -> 加密投票 -> 提交计票结果 -> 揭示结果", async function () {
    const votingId = await votingFactory.read.votingCount();
    assert.ok(votingId > 0n, "votingId must exist from previous test");

    // 推进到注册阶段
    await networkHelpers.time.increase(61);

    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }),
    });

    // 推进到投票阶段
    await networkHelpers.time.increase(250);

    const ballot1 = "0x0100" as `0x${string}`; // 模拟加密选票（选项0）
    const ballot2 = "0x0101" as `0x${string}`; // 模拟加密选票（选项1）
    await encryptedVoting.write.castVoteEncrypted([votingId, ballot1], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await encryptedVoting.write.castVoteEncrypted([votingId, ballot2], { account: voter1.account }),
    });

    // 推进到计票阶段
    await networkHelpers.time.increase(310);

    const stateBefore = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(stateBefore, 3, "应处于 Tallying(3) 状态");

    // 创建者提交解密后的票数：选项0 得 1 票，选项1 得 1 票，总 2 票
    const hashSubmit = await encryptedVoting.write.submitTallyResult(
      [votingId, 2n, [1n, 1n]],
      { account: deployer.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: hashSubmit });

    const submitted = await votingCenter.read.encryptedTallySubmitted([votingId]);
    assert.ok(submitted, "encryptedTallySubmitted 应为 true");

    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId, 1n]);
    const total = await votingCenter.read.totalVotes([votingId]);
    assert.equal(c0, 1n, "选项0 应为 1 票");
    assert.equal(c1, 1n, "选项1 应为 1 票");
    assert.equal(total, 2n, "总票数应为 2");

    // 揭示结果
    const hashReveal = await votingFactory.write.revealResult([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({ hash: hashReveal });

    const stateAfter = await votingFactory.read.getEffectiveState([votingId]);
    assert.equal(stateAfter, 4, "应处于 Finalized(4) 状态");
  });

  it("应拒绝重复提交计票结果", async function () {
    const block2 = await publicClient.getBlock();
    const t = Number(block2.timestamp);
    const params = {
      ...createParamsSimple,
      title: "加密投票-防重复提交",
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    await votingFactory.write.createVoting([params]);
    const votingId2 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId2], { account: deployer.account });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted(
      [votingId2, "0x01" as `0x${string}`],
      { account: deployer.account }
    );
    await networkHelpers.time.increase(310);
    await encryptedVoting.write.submitTallyResult([votingId2, 1n, [1n, 0n]], { account: deployer.account });
    await assert.rejects(
      () => encryptedVoting.write.submitTallyResult([votingId2, 1n, [1n, 0n]], { account: deployer.account }),
      /Tally already submitted|revert|fail/i
    );
  });

  it("应拒绝非创建者提交计票结果", async function () {
    const block3 = await publicClient.getBlock();
    const t = Number(block3.timestamp);
    const params = {
      ...createParamsSimple,
      title: "加密投票-仅创建者可提交",
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    await votingFactory.write.createVoting([params]);
    const votingId3 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId3], { account: deployer.account });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted(
      [votingId3, "0x02" as `0x${string}`],
      { account: deployer.account }
    );
    await networkHelpers.time.increase(310);
    await assert.rejects(
      () =>
        encryptedVoting.write.submitTallyResult([votingId3, 1n, [1n, 0n]], {
          account: voter1!.account,
        }),
      /Only creator|revert|fail/i
    );
  });

  it("应支持加密加权投票创建与注册", async function () {
    const block4 = await publicClient.getBlock();
    const t = Number(block4.timestamp);
    const params = {
      ...createParamsSimple,
      title: "加密加权投票",
      options: ["A", "B", "C"],
      votingRule: VOTING_RULE_WEIGHTED,
      weightGroupNames: ["普通", "高级"],
      weightGroupWeights: [1n, 3n],
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    } as typeof createParamsSimple;
    const hashCreate = await votingFactory.write.createVoting([params]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate });
    const votingId4 = await votingFactory.read.votingCount();
    assert.ok(votingId4 > 0n);

    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoterWeighted([votingId4, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoterWeighted([votingId4, 1n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted([votingId4, "0x01" as `0x${string}`], { account: deployer.account });
    await encryptedVoting.write.castVoteEncrypted([votingId4, "0x02" as `0x${string}`], { account: voter1.account });
    await networkHelpers.time.increase(310);
    await encryptedVoting.write.submitTallyResult([votingId4, 2n, [0n, 1n, 1n]], { account: deployer.account });
    await votingFactory.write.revealResult([votingId4], { account: deployer.account });
    const total = await votingCenter.read.totalVotes([votingId4]);
    assert.equal(total, 2n, "总票数应为 2");
  });

  it("应支持加密二次方投票（Quadratic）", async function () {
    const block5 = await publicClient.getBlock();
    const t = Number(block5.timestamp);
    const params = {
      ...createParamsSimple,
      title: "加密二次方投票",
      options: ["A", "B", "C"],
      votingRule: VOTING_RULE_QUADRATIC,
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    } as typeof createParamsSimple;
    await votingFactory.write.createVoting([params]);
    const votingId5 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId5], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId5], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted([votingId5, "0x01" as `0x${string}`], { account: deployer.account });
    await encryptedVoting.write.castVoteEncrypted([votingId5, "0x02" as `0x${string}`], { account: voter1.account });
    await networkHelpers.time.increase(310);
    // 解密后各选项得票（二次方分配后的汇总）
    await encryptedVoting.write.submitTallyResult([votingId5, 2n, [2n, 3n, 1n]], { account: deployer.account });
    await votingFactory.write.revealResult([votingId5], { account: deployer.account });
    const c0 = await votingCenter.read.voteCounts([votingId5, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId5, 1n]);
    const c2 = await votingCenter.read.voteCounts([votingId5, 2n]);
    assert.equal(c0, 2n, "选项A 应为 2");
    assert.equal(c1, 3n, "选项B 应为 3");
    assert.equal(c2, 1n, "选项C 应为 1");
  });

  it("应支持加密排序选择投票（RankedChoice）", async function () {
    const block6 = await publicClient.getBlock();
    const t = Number(block6.timestamp);
    const params = {
      ...createParamsSimple,
      title: "加密排序选择投票",
      options: ["X", "Y", "Z"],
      votingRule: VOTING_RULE_RANKED_CHOICE,
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    } as typeof createParamsSimple;
    await votingFactory.write.createVoting([params]);
    const votingId6 = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId6], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId6], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted([votingId6, "0x01" as `0x${string}`], { account: deployer.account });
    await encryptedVoting.write.castVoteEncrypted([votingId6, "0x02" as `0x${string}`], { account: voter1.account });
    await networkHelpers.time.increase(310);
    // 排序选择：提交 IRV 最后一轮各选项票数（链下算好）
    await encryptedVoting.write.submitTallyResult([votingId6, 2n, [1n, 1n, 0n]], { account: deployer.account });
    await votingFactory.write.revealResult([votingId6], { account: deployer.account });
    const state = await votingFactory.read.getEffectiveState([votingId6]);
    assert.equal(state, 4, "应处于 Finalized(4)");
    const total = await votingCenter.read.totalVotes([votingId6]);
    assert.equal(total, 2n, "总票数应为 2");
  });

  it("应支持阈值解密：t-of-n 委员会确认后计票结果生效", async function () {
    const block = await publicClient.getBlock();
    const t = Number(block.timestamp);
    const params = {
      ...createParamsSimple,
      title: "加密投票-阈值解密",
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
      useThresholdDecryption: true,
      thresholdCommittee: [deployer.account.address, voter1.account.address] as readonly `0x${string}`[],
      thresholdT: 2,
    } as typeof createParamsSimple;
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }),
    });
    await networkHelpers.time.increase(250);
    await encryptedVoting.write.castVoteEncrypted([votingId, "0x01" as `0x${string}`], { account: deployer.account });
    await encryptedVoting.write.castVoteEncrypted([votingId, "0x02" as `0x${string}`], { account: voter1.account });
    await networkHelpers.time.increase(310);
    assert.equal(await votingFactory.read.getEffectiveState([votingId]), 3, "应处于 Tallying");
    await encryptedVoting.write.submitTallyResult([votingId, 2n, [1n, 1n]], { account: deployer.account });
    const pending = await encryptedVoting.read.pendingTallySubmittedBy([votingId]);
    assert.ok(pending !== "0x0000000000000000000000000000000000000000", "应有待确认计票");
    await encryptedVoting.write.approveTallyResult([votingId], { account: deployer.account });
    const count1 = await encryptedVoting.read.pendingApprovalCount([votingId]);
    assert.equal(count1, 1n, "确认数应为 1");
    await encryptedVoting.write.approveTallyResult([votingId], { account: voter1.account });
    const submitted = await votingCenter.read.encryptedTallySubmitted([votingId]);
    assert.ok(submitted, "达到 t 人确认后计票应已写入");
    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId, 1n]);
    assert.equal(c0, 1n, "选项0 应为 1 票");
    assert.equal(c1, 1n, "选项1 应为 1 票");
    await votingFactory.write.revealResult([votingId], { account: deployer.account });
    assert.equal(await votingFactory.read.getEffectiveState([votingId]), 4, "应处于 Finalized(4)");
  });
});
