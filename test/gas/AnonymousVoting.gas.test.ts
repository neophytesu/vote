/**
 * Gas 基准测试：匿名投票（Semaphore）主要操作的 Gas 消耗
 *
 * 参考 test/AnonymousVoting.test.ts，只保留单一场景并打印 gasUsed。
 */
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

describe("Gas/AnonymousVoting", async () => {
  // 使用 hardhatMainnet 以支持 allowUnlimitedContractSize（PoseidonT3 库较大）
  const conn = await network.connect("hardhatMainnet");
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  if (!walletClients?.[0] || !publicClient || !networkHelpers) {
    throw new Error("Missing viem clients or networkHelpers");
  }

  // 部署 Semaphore 与投票相关合约
  const poseidonT3 = await viem.deployContract("PoseidonT3");
  const semaphoreVerifier = await viem.deployContract("SemaphoreVerifier");
  const semaphore = await viem.deployContract("Semaphore", [
    semaphoreVerifier.address,
  ], {
    libraries: {
      "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3":
        poseidonT3.address as `0x${string}`,
    },
  });
  const votingFactory = await viem.deployContract("VotingFactory", []);
  const registrationCenter = await viem.deployContract("RegistrationCenter", [
    votingFactory.address,
  ]);
  const votingCenter = await viem.deployContract("VotingCenter", [
    votingFactory.address,
    registrationCenter.address,
  ]);
  const revealCenter = await viem.deployContract("RevealCenter", [
    votingFactory.address,
  ]);
  const statisticsCenter = await viem.deployContract("StatisticsCenter", [
    votingFactory.address,
  ]);

  await votingFactory.write.setCenters([
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

  const hashSetAnonymous = await votingFactory.write.setAnonymousVoting([
    anonymousVoting.address,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: hashSetAnonymous });
  await statisticsCenter.write.setAnonymousVoting([anonymousVoting.address]);

  it("记录匿名投票创建/注册/投票的关键 Gas", async () => {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const regStart = BigInt(now + 60);
    const regEnd = BigInt(now + 300);
    const voteStart = BigInt(now + 300);
    const voteEnd = BigInt(now + 600);

    const params = {
      title: "Gas-匿名投票-简单多数",
      description: "Gas benchmark for anonymous voting",
      options: ["A", "B"],
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
      tokenContractAddress:
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      tokenMinBalance: 0n,
      useBlockNumber: false,
      allowExtension: true,
      snapshotBlockNumber: 0n,
      executionMode: 0,
      executionTarget:
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      executionValue: 0n,
      executionCalldata: "0x" as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig:
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
      executionTimelockDelay: 0n,
      useThresholdDecryption: false,
      thresholdCommittee: [] as readonly `0x${string}`[],
      thresholdT: 0,
      revealDelay: 0n,
    };

    // 创建匿名投票
    const hashCreate = await votingFactory.write.createVoting([params]);
    const receiptCreate = await publicClient.waitForTransactionReceipt({
      hash: hashCreate,
    });
    const votingId = await votingFactory.read.votingCount();
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][anonymous][createVoting] gasUsed=",
      receiptCreate.gasUsed.toString()
    );

    // 注册阶段：两个匿名身份
    await networkHelpers.time.increase(61);
    const id1 = new Identity("gas-anon-1");
    const id2 = new Identity("gas-anon-2");

    const hashReg1 = await anonymousVoting.write.registerVoterAnonymous(
      [votingId, id1.commitment],
      { account: walletClients[0]!.account }
    );
    const receiptReg1 = await publicClient.waitForTransactionReceipt({
      hash: hashReg1,
    });
    const hashReg2 = await anonymousVoting.write.registerVoterAnonymous(
      [votingId, id2.commitment],
      { account: walletClients[1]!.account }
    );
    const receiptReg2 = await publicClient.waitForTransactionReceipt({
      hash: hashReg2,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][anonymous][registerVoterAnonymous][1] gasUsed=",
      receiptReg1.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][anonymous][registerVoterAnonymous][2] gasUsed=",
      receiptReg2.gasUsed.toString()
    );

    // 投票阶段：两个匿名投票
    await networkHelpers.time.increase(250);
    const groupId = await anonymousVoting.read.votingSemaphoreGroupId([
      votingId,
    ]);
    const commitments = await fetchSemaphoreCommitments(
      publicClient,
      semaphore.address,
      groupId
    );
    const group = new Group(commitments);
    const scope = votingId;

    const proof1 = await generateProof(id1, group, 0n, scope);
    const p1 = {
      merkleTreeDepth: BigInt(proof1.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof1.merkleTreeRoot),
      nullifier: BigInt(proof1.nullifier),
      message: BigInt(proof1.message),
      scope: BigInt(proof1.scope),
      points: (proof1.points as string[]).map((x) => BigInt(x)) as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint
      ],
    };
    const proof2 = await generateProof(id2, group, 1n, scope);
    const p2 = {
      merkleTreeDepth: BigInt(proof2.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof2.merkleTreeRoot),
      nullifier: BigInt(proof2.nullifier),
      message: BigInt(proof2.message),
      scope: BigInt(proof2.scope),
      points: (proof2.points as string[]).map((x) => BigInt(x)) as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint
      ],
    };

    const hashVote1 = await anonymousVoting.write.castVoteAnonymous(
      [votingId, 0n, p1],
      { account: walletClients[0]!.account }
    );
    const receiptVote1 = await publicClient.waitForTransactionReceipt({
      hash: hashVote1,
    });
    const hashVote2 = await anonymousVoting.write.castVoteAnonymous(
      [votingId, 1n, p2],
      { account: walletClients[1]!.account }
    );
    const receiptVote2 = await publicClient.waitForTransactionReceipt({
      hash: hashVote2,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][anonymous][castVoteAnonymous][1] gasUsed=",
      receiptVote1.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][anonymous][castVoteAnonymous][2] gasUsed=",
      receiptVote2.gasUsed.toString()
    );
  });
});

