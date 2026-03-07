/**
 * Gas 基准测试：加密投票主要操作的 Gas 消耗
 *
 * 复用 EncryptedVoting.test.ts 中的部署方式，但侧重记录 gasUsed。
 */
import { describe, it } from "node:test";
import { network } from "hardhat";

const VOTING_RULE_SIMPLE = 0;
const PRIVACY_ENCRYPTED = 2;
const REG_RULE_OPEN = 0;

describe("Gas/EncryptedVoting", async () => {
  const conn = await network.connect("hardhat");
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  if (!walletClients?.[0] || !publicClient || !networkHelpers) {
    throw new Error("Missing viem clients or networkHelpers");
  }

  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  if (!deployer || !voter1) {
    throw new Error("Need at least 2 wallet clients");
  }

  // 部署与 EncryptedVoting.test.ts 一致的核心组件
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
  const encryptedVoting = await viem.deployContract("EncryptedVoting", [
    votingFactory.address,
    registrationCenter.address,
    votingCenter.address,
    statisticsCenter.address,
  ]);

  await viem.deployContract("QueryCenter", [votingFactory.address]);

  const hashSetEncrypted = await votingFactory.write.setEncryptedVoting([
    encryptedVoting.address,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: hashSetEncrypted });
  await statisticsCenter.write.setEncryptedVoting([encryptedVoting.address]);

  it("记录加密投票从创建到揭示的关键 Gas 消耗", async () => {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const regStart = BigInt(now + 60);
    const regEnd = BigInt(now + 300);
    const voteStart = BigInt(now + 300);
    const voteEnd = BigInt(now + 600);

    const createParams = {
      title: "Gas-加密投票-简单多数",
      description: "Gas benchmark for encrypted voting",
      options: ["A", "B"],
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

    // 创建加密投票
    const hashCreate = await votingFactory.write.createVoting([createParams]);
    const receiptCreate = await publicClient.waitForTransactionReceipt({
      hash: hashCreate,
    });
    const votingId = await votingFactory.read.votingCount();
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][encrypted][createVoting] gasUsed=",
      receiptCreate.gasUsed.toString()
    );

    // 注册阶段
    await networkHelpers.time.increase(61);
    const hashRegDeployer = await votingFactory.write.registerVoter([votingId], {
      account: deployer.account,
    });
    const receiptRegDeployer =
      await publicClient.waitForTransactionReceipt({
        hash: hashRegDeployer,
      });
    const hashRegVoter1 = await votingFactory.write.registerVoter([votingId], {
      account: voter1.account,
    });
    const receiptRegVoter1 = await publicClient.waitForTransactionReceipt({
      hash: hashRegVoter1,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][encrypted][registerVoter][deployer] gasUsed=",
      receiptRegDeployer.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][encrypted][registerVoter][voter1] gasUsed=",
      receiptRegVoter1.gasUsed.toString()
    );

    // 投票阶段（提交加密选票哈希）
    await networkHelpers.time.increase(250);
    const ballot1 = "0x0100" as `0x${string}`;
    const ballot2 = "0x0101" as `0x${string}`;
    const hashVote1 = await encryptedVoting.write.castVoteEncrypted(
      [votingId, ballot1],
      { account: deployer.account }
    );
    const receiptVote1 = await publicClient.waitForTransactionReceipt({
      hash: hashVote1,
    });
    const hashVote2 = await encryptedVoting.write.castVoteEncrypted(
      [votingId, ballot2],
      { account: voter1.account }
    );
    const receiptVote2 = await publicClient.waitForTransactionReceipt({
      hash: hashVote2,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][encrypted][castVoteEncrypted][deployer] gasUsed=",
      receiptVote1.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][encrypted][castVoteEncrypted][voter1] gasUsed=",
      receiptVote2.gasUsed.toString()
    );

    // 计票阶段：提交解密结果 + 揭示
    await networkHelpers.time.increase(310);
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
      "[Gas][encrypted][submitTallyResult] gasUsed=",
      receiptSubmit.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][encrypted][revealResult] gasUsed=",
      receiptReveal.gasUsed.toString()
    );
  });
});

