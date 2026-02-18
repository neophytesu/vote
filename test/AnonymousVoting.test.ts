/**
 * 匿名投票测试 - 使用 Semaphore ZK 证明
 * 测试流程: 部署 -> 创建匿名投票 -> 注册选民 -> 投票 -> 验证结果
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

const SEMAPHORE_ABI = [
  {
    type: "event",
    name: "MemberAdded",
    inputs: [
      { name: "groupId", type: "uint256", indexed: true },
      { name: "index", type: "uint256", indexed: false },
      { name: "identityCommitment", type: "uint256", indexed: false },
      { name: "merkleTreeRoot", type: "uint256", indexed: false },
    ],
  },
] as const;

const ANONYMOUS_VOTING_ABI = [
  {
    type: "function",
    name: "registerVoterAnonymous",
    inputs: [
      { name: "votingId", type: "uint256" },
      { name: "identityCommitment", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "castVoteAnonymous",
    inputs: [
      { name: "votingId", type: "uint256" },
      { name: "optionIndex", type: "uint256" },
      {
        name: "proof",
        type: "tuple",
        components: [
          { name: "merkleTreeDepth", type: "uint256" },
          { name: "merkleTreeRoot", type: "uint256" },
          { name: "nullifier", type: "uint256" },
          { name: "message", type: "uint256" },
          { name: "scope", type: "uint256" },
          { name: "points", type: "uint256[8]" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "semaphore",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "votingSemaphoreGroupId",
    inputs: [{ name: "votingId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const VOTING_FACTORY_ABI = [
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
          { name: "snapshotBlockNumber", type: "uint256" },
          { name: "executionTarget", type: "address" },
          { name: "executionValue", type: "uint256" },
          { name: "executionCalldata", type: "bytes" },
          { name: "executionOnWinningOption", type: "uint256" },
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
] as const;

// VotingRule: SimpleMajority=0, Weighted=1, Quadratic=2, RankedChoice=3
// PrivacyLevel: Anonymous=1, Encrypted=2, FullPrivacy=3, RegistrationRule.Open=0
const VOTING_RULE_SIMPLE = 0;
const VOTING_RULE_WEIGHTED = 1;
const VOTING_RULE_QUADRATIC = 2;
const VOTING_RULE_RANKED = 3;
const PRIVACY_ANONYMOUS = 1;
const PRIVACY_FULL = 3;
const REG_RULE_OPEN = 0;

async function fetchSemaphoreCommitments(
  publicClient: { getContractEvents: (opts: object) => Promise<unknown[]> },
  semaphoreAddress: `0x${string}`,
  groupId: bigint
): Promise<bigint[]> {
  const allEvents = (await publicClient.getContractEvents({
    address: semaphoreAddress,
    abi: SEMAPHORE_ABI,
    eventName: "MemberAdded",
    fromBlock: 0n,
    strict: true,
  })) as { args: { groupId: bigint; index: bigint; identityCommitment: bigint } }[];
  const events = allEvents.filter((e) => e.args.groupId === groupId);
  const byIndex = events.map((e) => ({
    index: Number(e.args.index),
    commitment: e.args.identityCommitment,
  }));
  byIndex.sort((a, b) => a.index - b.index);
  return byIndex.map((x) => x.commitment);
}

describe("AnonymousVoting", async function () {
  // 使用 hardhatMainnet 以支持 allowUnlimitedContractSize（PoseidonT3 库较大）
  const conn = await network.connect("hardhatMainnet");
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  if (!walletClients?.[0] || !publicClient || !networkHelpers) {
    throw new Error("Missing viem clients or networkHelpers");
  }

  // 部署完整合约
  const poseidonT3 = await viem.deployContract("PoseidonT3");
  const semaphoreVerifier = await viem.deployContract("SemaphoreVerifier");
  const semaphore = await viem.deployContract("Semaphore", [semaphoreVerifier.address], {
    libraries: {
      "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3": poseidonT3.address as `0x${string}`,
    },
  });
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
  const anonymousVoting = await viem.deployContract("AnonymousVoting", [
    votingFactory.address,
    semaphore.address,
    registrationCenter.address,
    votingCenter.address,
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
  const hashSetAnonymous = await votingFactory.write.setAnonymousVoting([anonymousVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: hashSetAnonymous });
  const hashSetEncrypted = await votingFactory.write.setEncryptedVoting([encryptedVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: hashSetEncrypted });
  await revealCenter.write.setVotingCore([votingFactory.address]);
  await statisticsCenter.write.setAuthorizedCaller([votingFactory.address]);
  await statisticsCenter.write.setAnonymousVoting([anonymousVoting.address]);
  await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);

  // 使用时间戳模式，避免区块模式在 EDR 中的时序问题
  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const regStart = BigInt(now + 60);
  const regEnd = BigInt(now + 300);
  const voteStart = BigInt(now + 300);
  const voteEnd = BigInt(now + 600);

  const createParams = {
    title: "匿名投票测试",
    description: "测试 Semaphore 匿名投票流程",
    options: ["选项A", "选项B"],
    votingRule: VOTING_RULE_SIMPLE,
    privacyLevel: PRIVACY_ANONYMOUS,
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
    executionMode: 0, // None
    executionTarget: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    executionValue: 0n,
    executionCalldata: "0x" as `0x${string}`,
    executionOnWinningOption: 0n,
    executionMultisig: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    executionTimelockDelay: 0n,
    useThresholdDecryption: false,
    thresholdCommittee: [] as readonly `0x${string}`[],
    thresholdT: 0,
  };

  const hashCreate = await votingFactory.write.createVoting([createParams]);
  await publicClient.waitForTransactionReceipt({ hash: hashCreate });
  const votingCount = await votingFactory.read.votingCount();
  const votingId = votingCount;

  it("应成功创建匿名投票并创建 Semaphore 群组", async function () {
    assert.ok(votingId > 0n, "votingId should be > 0");
    const hasGroup = await anonymousVoting.read.hasSemaphoreGroup([votingId]);
    assert.ok(hasGroup, "Semaphore group should be created");
  });

  it("应成功注册并匿名投票", async function () {
    // 推进时间到注册阶段（now+60 秒后）
    await networkHelpers.time.increase(61);

    // 2 个选民：使用不同账户
    const identities: Identity[] = [
      new Identity(),
      new Identity("optional-trapdoor-and-nullifier-seed-voter2"),
    ];

    // 用 account 0 和 1 分别注册（需要不同的 wallet client）
    const deployer = walletClients[0];
    const voter1 = walletClients[1];
    if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

    // 选民1 注册
    const commitment1 = identities[0].commitment;
    const tx1 = await anonymousVoting.write.registerVoterAnonymous(
      [votingId, commitment1],
      { account: deployer.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: tx1 });

    // 选民2 注册（用 account 1）
    const commitment2 = identities[1].commitment;
    const tx2 = await anonymousVoting.write.registerVoterAnonymous(
      [votingId, commitment2],
      { account: voter1.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: tx2 });

    // 推进时间到投票阶段
    await networkHelpers.time.increase(250);

    // 获取 Semaphore 群组 commitments
    const groupId = await anonymousVoting.read.votingSemaphoreGroupId([votingId]);
    const commitments = await fetchSemaphoreCommitments(
      publicClient,
      semaphore.address,
      groupId
    );
    assert.equal(commitments.length, 2, "应有两名注册选民");

    const group = new Group(commitments);
    const scope = votingId;

    // 选民1 投选项0（选项A）
    const message1 = 0n; // optionIndex
    const proof1 = await generateProof(identities[0], group, message1, scope);
    const proofForContract1 = {
      merkleTreeDepth: BigInt(proof1.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof1.merkleTreeRoot),
      nullifier: BigInt(proof1.nullifier),
      message: BigInt(proof1.message),
      scope: BigInt(proof1.scope),
      points: (proof1.points as string[]).map((p) => BigInt(p)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };
    const hashVote1 = await anonymousVoting.write.castVoteAnonymous(
      [votingId, 0n, proofForContract1],
      { account: deployer.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: hashVote1 });

    // 选民2 投选项1（选项B）
    const message2 = 1n;
    const proof2 = await generateProof(identities[1], group, message2, scope);
    const proofForContract2 = {
      merkleTreeDepth: BigInt(proof2.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof2.merkleTreeRoot),
      nullifier: BigInt(proof2.nullifier),
      message: BigInt(proof2.message),
      scope: BigInt(proof2.scope),
      points: (proof2.points as string[]).map((p) => BigInt(p)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };
    const hashVote2 = await anonymousVoting.write.castVoteAnonymous(
      [votingId, 1n, proofForContract2],
      { account: voter1.account }
    );
    await publicClient.waitForTransactionReceipt({ hash: hashVote2 });

    // 验证票数
    const votesOption0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const votesOption1 = await votingCenter.read.voteCounts([votingId, 1n]);
    const totalVotes = await votingCenter.read.totalVotes([votingId]);

    assert.equal(votesOption0, 1n, "选项A 应有 1 票");
    assert.equal(votesOption1, 1n, "选项B 应有 1 票");
    assert.equal(totalVotes, 2n, "总投票数应为 2");
  });

  it("应拒绝重复投票（同一 nullifier 只能使用一次）", async function () {
    const identity = new Identity("double-vote-test");
    const commitment = identity.commitment;

    const blk = await publicClient.getBlock();
    const t = Number(blk.timestamp);
    const params = {
      ...createParams,
      title: "防重复投票测试",
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    const hashCreate2 = await votingFactory.write.createVoting([params]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreate2 });
    const votingId2 = await votingFactory.read.votingCount();

    await networkHelpers.time.increase(61);
    await anonymousVoting.write.registerVoterAnonymous([votingId2, commitment]);
    await networkHelpers.time.increase(130);

    const groupId = await anonymousVoting.read.votingSemaphoreGroupId([votingId2]);
    const commitments = await fetchSemaphoreCommitments(publicClient, semaphore.address, groupId);
    assert.equal(commitments.length, 1, "应有 1 名注册选民");
    const group = new Group(commitments);
    const scope = votingId2;

    const proof = await generateProof(identity, group, 0n, scope);
    const proofForContract = {
      merkleTreeDepth: BigInt(proof.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof.merkleTreeRoot),
      nullifier: BigInt(proof.nullifier),
      message: BigInt(proof.message),
      scope: BigInt(proof.scope),
      points: (proof.points as string[]).map((p) => BigInt(p)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };

    await anonymousVoting.write.castVoteAnonymous([votingId2, 0n, proofForContract]);

    // 同一 identity 再次投票：相同 scope 产生相同 nullifier，应 revert
    const proof2 = await generateProof(identity, group, 1n, scope);
    const p2 = {
      merkleTreeDepth: BigInt(proof2.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof2.merkleTreeRoot),
      nullifier: BigInt(proof2.nullifier),
      message: BigInt(proof2.message),
      scope: BigInt(proof2.scope),
      points: (proof2.points as string[]).map((p) => BigInt(p)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };
    await assert.rejects(
      () => anonymousVoting.write.castVoteAnonymous([votingId2, 1n, p2]),
      /nullifier|InvalidProof|revert|fail/i
    );
  });

  it("应支持完全隐私投票（Full Privacy）：Semaphore 注册 + 加密选票 + 链下解密计票", async function () {
    const blk = await publicClient.getBlock();
    const t = Number(blk.timestamp);
    const fullParams = {
      ...createParams,
      title: "完全隐私投票测试",
      privacyLevel: PRIVACY_FULL,
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    const hashCreateFull = await votingFactory.write.createVoting([fullParams]);
    await publicClient.waitForTransactionReceipt({ hash: hashCreateFull });
    const votingIdFull = await votingFactory.read.votingCount();
    assert.ok(await anonymousVoting.read.hasSemaphoreGroup([votingIdFull]), "Full privacy should have Semaphore group");

    await networkHelpers.time.increase(61);
    const id1 = new Identity("fp-voter1");
    const id2 = new Identity("fp-voter2");
    const deployer = walletClients[0];
    const voter1 = walletClients[1];
    if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

    await anonymousVoting.write.registerVoterAnonymous([votingIdFull, id1.commitment], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.registerVoterAnonymous([votingIdFull, id2.commitment], { account: voter1.account }),
    });
    await networkHelpers.time.increase(130);

    const groupIdFull = await anonymousVoting.read.votingSemaphoreGroupId([votingIdFull]);
    const commitmentsFull = await fetchSemaphoreCommitments(publicClient, semaphore.address, groupIdFull);
    const groupFull = new Group(commitmentsFull);
    const scopeFull = votingIdFull;
    const messageZero = 0n;

    const proof1 = await generateProof(id1, groupFull, messageZero, scopeFull);
    const proof1ForContract = {
      merkleTreeDepth: BigInt(proof1.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof1.merkleTreeRoot),
      nullifier: BigInt(proof1.nullifier),
      message: BigInt(proof1.message),
      scope: BigInt(proof1.scope),
      points: (proof1.points as string[]).map((p) => BigInt(p)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };
    const proof2 = await generateProof(id2, groupFull, messageZero, scopeFull);
    const proof2ForContract = {
      merkleTreeDepth: BigInt(proof2.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof2.merkleTreeRoot),
      nullifier: BigInt(proof2.nullifier),
      message: BigInt(proof2.message),
      scope: BigInt(proof2.scope),
      points: (proof2.points as string[]).map((p) => BigInt(p)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };

    await anonymousVoting.write.castVoteFullPrivacy(
      [votingIdFull, "0x0100" as `0x${string}`, proof1ForContract],
      { account: deployer.account }
    );
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.castVoteFullPrivacy(
        [votingIdFull, "0x0101" as `0x${string}`, proof2ForContract],
        { account: voter1.account }
      ),
    });

    const ballotCount = await votingCenter.read.encryptedBallotCount([votingIdFull]);
    assert.equal(ballotCount, 2n, "应收到 2 张完全隐私选票");

    await networkHelpers.time.increase(190);
    await encryptedVoting.write.submitTallyResult([votingIdFull, 2n, [1n, 1n]], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.revealResult([votingIdFull], { account: deployer.account }),
    });

    const state = await votingFactory.read.getEffectiveState([votingIdFull]);
    assert.equal(state, 4, "应处于 Finalized(4)");
    const c0 = await votingCenter.read.voteCounts([votingIdFull, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingIdFull, 1n]);
    assert.equal(c0, 1n, "选项0 应为 1 票");
    assert.equal(c1, 1n, "选项1 应为 1 票");
  });

  /** 完全隐私：生成 message=0 的 proof 并转为合约参数 */
  function toProofTuple(p: { merkleTreeDepth: number; merkleTreeRoot: string; nullifier: string; message: string; scope: string; points: string[] }) {
    return {
      merkleTreeDepth: BigInt(p.merkleTreeDepth),
      merkleTreeRoot: BigInt(p.merkleTreeRoot),
      nullifier: BigInt(p.nullifier),
      message: BigInt(p.message),
      scope: BigInt(p.scope),
      points: (p.points as string[]).map((x) => BigInt(x)) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    };
  }

  it("完全隐私 - 加权（Weighted）：注册按分组 + 加密选票 + 提交解密计票", async function () {
    const blk = await publicClient.getBlock();
    const t = Number(blk.timestamp);
    const deployer = walletClients[0];
    const voter1 = walletClients[1];
    if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

    const fullWeightedParams = {
      ...createParams,
      title: "完全隐私加权",
      options: ["A", "B", "C"],
      votingRule: VOTING_RULE_WEIGHTED,
      privacyLevel: PRIVACY_FULL,
      weightGroupNames: ["普通", "高级"],
      weightGroupWeights: [1n, 3n],
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    await votingFactory.write.createVoting([fullWeightedParams]);
    const vid = await votingFactory.read.votingCount();

    await networkHelpers.time.increase(61);
    const id1 = new Identity("fpw1");
    const id2 = new Identity("fpw2");
    await anonymousVoting.write.registerVoterAnonymousWeighted([vid, id1.commitment, 0n], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.registerVoterAnonymousWeighted([vid, id2.commitment, 1n], { account: voter1.account }),
    });
    await networkHelpers.time.increase(130);

    const gid0 = await anonymousVoting.read.votingSemaphoreGroupIdByWeight([vid, 0n]);
    const gid1 = await anonymousVoting.read.votingSemaphoreGroupIdByWeight([vid, 1n]);
    const commitments0 = await fetchSemaphoreCommitments(publicClient, semaphore.address, gid0);
    const commitments1 = await fetchSemaphoreCommitments(publicClient, semaphore.address, gid1);
    const group0 = new Group(commitments0);
    const group1 = new Group(commitments1);
    const scope = vid;
    const msgZero = 0n;

    const proof1 = await generateProof(id1, group0, msgZero, scope);
    const proof2 = await generateProof(id2, group1, msgZero, scope);
    await anonymousVoting.write.castVoteFullPrivacyWeighted(
      [vid, "0x01" as `0x${string}`, 0n, toProofTuple(proof1)],
      { account: deployer.account }
    );
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.castVoteFullPrivacyWeighted(
        [vid, "0x02" as `0x${string}`, 1n, toProofTuple(proof2)],
        { account: voter1.account }
      ),
    });

    assert.equal(await votingCenter.read.encryptedBallotCount([vid]), 2n, "应收到 2 张加密选票");
    await networkHelpers.time.increase(190);
    await encryptedVoting.write.submitTallyResult([vid, 2n, [0n, 1n, 1n]], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.revealResult([vid], { account: deployer.account }),
    });
    assert.equal(await votingFactory.read.getEffectiveState([vid]), 4, "应 Finalized");
  });

  it("完全隐私 - 排序选择（RankedChoice）：加密选票 + 提交 IRV 最终票数", async function () {
    const blk = await publicClient.getBlock();
    const t = Number(blk.timestamp);
    const deployer = walletClients[0];
    const voter1 = walletClients[1];
    if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

    const fullRankedParams = {
      ...createParams,
      title: "完全隐私排序选择",
      options: ["X", "Y", "Z"],
      votingRule: VOTING_RULE_RANKED,
      privacyLevel: PRIVACY_FULL,
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    await votingFactory.write.createVoting([fullRankedParams]);
    const vid = await votingFactory.read.votingCount();

    await networkHelpers.time.increase(61);
    const id1 = new Identity("fpr1");
    const id2 = new Identity("fpr2");
    await anonymousVoting.write.registerVoterAnonymous([vid, id1.commitment], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.registerVoterAnonymous([vid, id2.commitment], { account: voter1.account }),
    });
    await networkHelpers.time.increase(130);

    const gid = await anonymousVoting.read.votingSemaphoreGroupId([vid]);
    const commitments = await fetchSemaphoreCommitments(publicClient, semaphore.address, gid);
    const group = new Group(commitments);
    const scope = vid;
    const proof1 = await generateProof(id1, group, 0n, scope);
    const proof2 = await generateProof(id2, group, 0n, scope);

    await anonymousVoting.write.castVoteFullPrivacy([vid, "0x01" as `0x${string}`, toProofTuple(proof1)], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.castVoteFullPrivacy([vid, "0x02" as `0x${string}`, toProofTuple(proof2)], { account: voter1.account }),
    });

    assert.equal(await votingCenter.read.encryptedBallotCount([vid]), 2n, "应收到 2 张加密选票");
    await networkHelpers.time.increase(190);
    await encryptedVoting.write.submitTallyResult([vid, 2n, [1n, 1n, 0n]], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.revealResult([vid], { account: deployer.account }),
    });
    assert.equal(await votingFactory.read.getEffectiveState([vid]), 4, "应 Finalized");
  });

  it("完全隐私 - 二次方（Quadratic）：加密选票 + 提交各选项汇总票数", async function () {
    const blk = await publicClient.getBlock();
    const t = Number(blk.timestamp);
    const deployer = walletClients[0];
    const voter1 = walletClients[1];
    if (!deployer || !voter1) throw new Error("Need at least 2 wallet clients");

    const fullQuadParams = {
      ...createParams,
      title: "完全隐私二次方",
      options: ["P", "Q", "R"],
      votingRule: VOTING_RULE_QUADRATIC,
      privacyLevel: PRIVACY_FULL,
      registrationStart: BigInt(t + 60),
      registrationEnd: BigInt(t + 180),
      votingStart: BigInt(t + 180),
      votingEnd: BigInt(t + 360),
    };
    await votingFactory.write.createVoting([fullQuadParams]);
    const vid = await votingFactory.read.votingCount();

    await networkHelpers.time.increase(61);
    const id1 = new Identity("fpq1");
    const id2 = new Identity("fpq2");
    await anonymousVoting.write.registerVoterAnonymous([vid, id1.commitment], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.registerVoterAnonymous([vid, id2.commitment], { account: voter1.account }),
    });
    await networkHelpers.time.increase(130);

    const gid = await anonymousVoting.read.votingSemaphoreGroupId([vid]);
    const commitments = await fetchSemaphoreCommitments(publicClient, semaphore.address, gid);
    const group = new Group(commitments);
    const scope = vid;
    const proof1 = await generateProof(id1, group, 0n, scope);
    const proof2 = await generateProof(id2, group, 0n, scope);

    await anonymousVoting.write.castVoteFullPrivacy([vid, "0x01" as `0x${string}`, toProofTuple(proof1)], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await anonymousVoting.write.castVoteFullPrivacy([vid, "0x02" as `0x${string}`, toProofTuple(proof2)], { account: voter1.account }),
    });

    assert.equal(await votingCenter.read.encryptedBallotCount([vid]), 2n, "应收到 2 张加密选票");
    await networkHelpers.time.increase(190);
    await encryptedVoting.write.submitTallyResult([vid, 2n, [2n, 3n, 1n]], { account: deployer.account });
    await publicClient.waitForTransactionReceipt({
      hash: await votingFactory.write.revealResult([vid], { account: deployer.account }),
    });
    assert.equal(await votingFactory.read.getEffectiveState([vid]), 4, "应 Finalized");
    const c0 = await votingCenter.read.voteCounts([vid, 0n]);
    const c1 = await votingCenter.read.voteCounts([vid, 1n]);
    const c2 = await votingCenter.read.voteCounts([vid, 2n]);
    assert.equal(c0, 2n, "选项0 应为 2");
    assert.equal(c1, 3n, "选项1 应为 3");
    assert.equal(c2, 1n, "选项2 应为 1");
  });
});
