/**
 * Gas 基准测试：完全隐私投票（FullPrivacy：Semaphore + 加密）主要操作的 Gas 消耗
 *
 * 参考 test/AnonymousVoting.test.ts 的 Full Privacy 场景。
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

function toProofTuple(p: {
  merkleTreeDepth: number;
  merkleTreeRoot: string;
  nullifier: string;
  message: string;
  scope: string;
  points: string[];
}) {
  return {
    merkleTreeDepth: BigInt(p.merkleTreeDepth),
    merkleTreeRoot: BigInt(p.merkleTreeRoot),
    nullifier: BigInt(p.nullifier),
    message: BigInt(p.message),
    scope: BigInt(p.scope),
    points: (p.points as string[]).map((x) => BigInt(x)) as [
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
}

describe("Gas/FullPrivacy", async () => {
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
  const encryptedVoting = await viem.deployContract("EncryptedVoting", [
    votingFactory.address,
    registrationCenter.address,
    votingCenter.address,
    statisticsCenter.address,
  ]);
  await viem.deployContract("QueryCenter", [votingFactory.address]);

  await votingFactory.write.setAnonymousVoting([anonymousVoting.address]);
  await votingFactory.write.setEncryptedVoting([encryptedVoting.address]);
  await statisticsCenter.write.setAnonymousVoting([anonymousVoting.address]);
  await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);

  it("记录完全隐私从创建到揭示的关键 Gas", async () => {
    const blk = await publicClient.getBlock();
    const now = Number(blk.timestamp);
    const regStart = BigInt(now + 60);
    const regEnd = BigInt(now + 180);
    const voteStart = BigInt(now + 180);
    const voteEnd = BigInt(now + 360);

    const params = {
      title: "Gas-完全隐私-简单多数",
      description: "Gas benchmark for full-privacy voting",
      options: ["A", "B"],
      votingRule: VOTING_RULE_SIMPLE,
      privacyLevel: PRIVACY_FULL,
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

    // 创建完全隐私投票
    const hashCreate = await votingFactory.write.createVoting([params]);
    const receiptCreate = await publicClient.waitForTransactionReceipt({
      hash: hashCreate,
    });
    const votingId = await votingFactory.read.votingCount();
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][createVoting] gasUsed=",
      receiptCreate.gasUsed.toString()
    );

    // 注册阶段：两个匿名身份
    await networkHelpers.time.increase(61);
    const id1 = new Identity("gas-fp-1");
    const id2 = new Identity("gas-fp-2");
    const deployer = walletClients[0]!;
    const voter1 = walletClients[1]!;

    const hashReg1 = await anonymousVoting.write.registerVoterAnonymous(
      [votingId, id1.commitment],
      { account: deployer.account }
    );
    const receiptReg1 = await publicClient.waitForTransactionReceipt({
      hash: hashReg1,
    });
    const hashReg2 = await anonymousVoting.write.registerVoterAnonymous(
      [votingId, id2.commitment],
      { account: voter1.account }
    );
    const receiptReg2 = await publicClient.waitForTransactionReceipt({
      hash: hashReg2,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][registerVoterAnonymous][1] gasUsed=",
      receiptReg1.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][registerVoterAnonymous][2] gasUsed=",
      receiptReg2.gasUsed.toString()
    );

    // 投票阶段：两个完全隐私加密投票
    await networkHelpers.time.increase(130);
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
    const messageZero = 0n;

    const proof1 = await generateProof(id1, group, messageZero, scope);
    const p1 = toProofTuple(proof1);
    const proof2 = await generateProof(id2, group, messageZero, scope);
    const p2 = toProofTuple(proof2);

    const hashVote1 = await anonymousVoting.write.castVoteFullPrivacy(
      [votingId, "0x0100" as `0x${string}`, p1],
      { account: deployer.account }
    );
    const receiptVote1 = await publicClient.waitForTransactionReceipt({
      hash: hashVote1,
    });
    const hashVote2 = await anonymousVoting.write.castVoteFullPrivacy(
      [votingId, "0x0101" as `0x${string}`, p2],
      { account: voter1.account }
    );
    const receiptVote2 = await publicClient.waitForTransactionReceipt({
      hash: hashVote2,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][castVoteFullPrivacy][1] gasUsed=",
      receiptVote1.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][castVoteFullPrivacy][2] gasUsed=",
      receiptVote2.gasUsed.toString()
    );

    // 计票阶段：提交解密结果 + 揭示
    await networkHelpers.time.increase(190);
    const hashSubmit = await encryptedVoting.write.submitTallyResult(
      [votingId, 2n, [1n, 1n]],
      { account: deployer.account }
    );
    const receiptSubmit = await publicClient.waitForTransactionReceipt({
      hash: hashSubmit,
    });
    const hashReveal = await votingFactory.write.revealResult([votingId], {
      account: deployer.account,
    });
    const receiptReveal = await publicClient.waitForTransactionReceipt({
      hash: hashReveal,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][submitTallyResult] gasUsed=",
      receiptSubmit.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][fullPrivacy][revealResult] gasUsed=",
      receiptReveal.gasUsed.toString()
    );
  });
});

