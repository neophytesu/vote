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

// VotingRule.SimpleMajority=0, PrivacyLevel.Anonymous=1, RegistrationRule.Open=0
const VOTING_RULE_SIMPLE = 0;
const PRIVACY_ANONYMOUS = 1;
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
  await viem.deployContract("QueryCenter", [votingFactory.address]);

  // 配置
  await registrationCenter.write.setVotingCore([votingFactory.address]);
  await votingCenter.write.setVotingCore([votingFactory.address]);
  await votingCenter.write.setRegistrationCenter([registrationCenter.address]);
  const hashSetAnonymous = await votingFactory.write.setAnonymousVoting([anonymousVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: hashSetAnonymous });
  await revealCenter.write.setVotingCore([votingFactory.address]);
  await statisticsCenter.write.setAuthorizedCaller([votingFactory.address]);
  await statisticsCenter.write.setAnonymousVoting([anonymousVoting.address]);

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
});
