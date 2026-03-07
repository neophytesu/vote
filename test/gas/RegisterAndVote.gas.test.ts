/**
 * Gas 基准测试：公开投票中注册与投票的 Gas 消耗
 */
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "../fixtures/deploy.js";

describe("Gas/RegisterAndVote (Public)", async () => {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    votingCenter,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);

  const walletClients = (await conn.viem.getWalletClients())!;
  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  if (!deployer || !voter1) {
    throw new Error("Need at least 2 wallet clients");
  }

  it("记录公开投票中注册/投票/揭示的 Gas", async () => {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "Gas-公开-注册与投票",
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
    });

    // 创建投票
    const hashCreate = await votingFactory.write.createVoting([params]);
    const receiptCreate = await publicClient.waitForTransactionReceipt({
      hash: hashCreate,
    });
    const votingId = await votingFactory.read.votingCount();

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][public][createVoting] gasUsed=",
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
      "[Gas][public][registerVoter][deployer] gasUsed=",
      receiptRegDeployer.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][public][registerVoter][voter1] gasUsed=",
      receiptRegVoter1.gasUsed.toString()
    );

    // 投票阶段
    await networkHelpers.time.increase(250);
    const hashVoteDeployer = await votingFactory.write.castVote(
      [votingId, 0n],
      { account: deployer.account }
    );
    const receiptVoteDeployer = await publicClient.waitForTransactionReceipt({
      hash: hashVoteDeployer,
    });
    const hashVoteVoter1 = await votingFactory.write.castVote(
      [votingId, 1n],
      { account: voter1.account }
    );
    const receiptVoteVoter1 = await publicClient.waitForTransactionReceipt({
      hash: hashVoteVoter1,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][public][castVote][deployer] gasUsed=",
      receiptVoteDeployer.gasUsed.toString()
    );
    // eslint-disable-next-line no-console
    console.log(
      "[Gas][public][castVote][voter1] gasUsed=",
      receiptVoteVoter1.gasUsed.toString()
    );

    // 揭示阶段
    await networkHelpers.time.increase(310);
    const hashReveal = await votingFactory.write.revealResult([votingId], {
      account: deployer.account,
    });
    const receiptReveal = await publicClient.waitForTransactionReceipt({
      hash: hashReveal,
    });

    // eslint-disable-next-line no-console
    console.log(
      "[Gas][public][revealResult] gasUsed=",
      receiptReveal.gasUsed.toString()
    );

    // 简单校验票数，保证测试同时也是功能正确性回归
    const c0 = await votingCenter.read.voteCounts([votingId, 0n]);
    const c1 = await votingCenter.read.voteCounts([votingId, 1n]);
    const total = await votingCenter.read.totalVotes([votingId]);
    if (c0 + c1 !== total) {
      throw new Error("voteCounts and totalVotes mismatch in gas test");
    }
  });
});

