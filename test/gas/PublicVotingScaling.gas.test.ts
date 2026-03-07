/**
 * 扩展性测试：公开投票在不同选民数量下注册/投票的 Gas 与执行时间
 */
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "../fixtures/deploy.js";

async function runScalingCase(
  label: string,
  voterCount: number
): Promise<void> {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    votingCenter,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);
  const walletClients = (await conn.viem.getWalletClients())!;

  const deployer = walletClients[0];
  const voters = walletClients.slice(1, voterCount + 1);
  if (!deployer || voters.length < voterCount) {
    throw new Error(`Need at least ${voterCount + 1} wallet clients`);
  }

  const block = await publicClient.getBlock();
  const now = Number(block.timestamp);
  const params = defaultCreateParams(now, {
    title: `Gas-公开-扩展性-${label}`,
    registrationStart: BigInt(now + 60),
    registrationEnd: BigInt(now + 180),
    votingStart: BigInt(now + 180),
    votingEnd: BigInt(now + 360),
  });

  const hashCreate = await votingFactory.write.createVoting([params]);
  const receiptCreate = await publicClient.waitForTransactionReceipt({
    hash: hashCreate,
  });
  const votingId = await votingFactory.read.votingCount();

  // eslint-disable-next-line no-console
  console.log(
    `[Scaling][${label}][createVoting] gasUsed=`,
    receiptCreate.gasUsed.toString()
  );

  // 注册阶段
  await networkHelpers.time.increase(61);

  const gasRegister: bigint[] = [];
  for (const v of voters) {
    const hash = await votingFactory.write.registerVoter([votingId], {
      account: v.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    gasRegister.push(receipt.gasUsed);
  }

  const totalRegGas = gasRegister.reduce((a, b) => a + b, 0n);
  const avgRegGas =
    gasRegister.length > 0
      ? totalRegGas / BigInt(gasRegister.length)
      : 0n;

  // eslint-disable-next-line no-console
  console.log(
    `[Scaling][${label}][registerVoter] totalGas=`,
    totalRegGas.toString(),
    "avgGas=",
    avgRegGas.toString()
  );

  // 投票阶段
  await networkHelpers.time.increase(250);

  const gasVote: bigint[] = [];
  for (const [idx, v] of voters.entries()) {
    const option = BigInt(idx % 2); // 两个选项轮流投
    const hash = await votingFactory.write.castVote([votingId, option], {
      account: v.account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    gasVote.push(receipt.gasUsed);
  }

  const totalVoteGas = gasVote.reduce((a, b) => a + b, 0n);
  const avgVoteGas =
    gasVote.length > 0 ? totalVoteGas / BigInt(gasVote.length) : 0n;

  // eslint-disable-next-line no-console
  console.log(
    `[Scaling][${label}][castVote] totalGas=`,
    totalVoteGas.toString(),
    "avgGas=",
    avgVoteGas.toString()
  );

  // 揭示
  await networkHelpers.time.increase(310);
  const hashReveal = await votingFactory.write.revealResult([votingId], {
    account: deployer.account,
  });
  const receiptReveal = await publicClient.waitForTransactionReceipt({
    hash: hashReveal,
  });

  // eslint-disable-next-line no-console
  console.log(
    `[Scaling][${label}][revealResult] gasUsed=`,
    receiptReveal.gasUsed.toString()
  );

  // 校验票数是否等于注册人数
  const totalVotes = await votingCenter.read.totalVotes([votingId]);
  if (totalVotes !== BigInt(voters.length)) {
    throw new Error(
      `[Scaling][${label}] totalVotes (${totalVotes}) != voters (${voters.length})`
    );
  }
}

describe("Gas/PublicVotingScaling", () => {
  it("10 名选民注册与投票的 Gas", async () => {
    await runScalingCase("10-voters", 10);
  });

  it("20 名选民注册与投票的 Gas", async () => {
    await runScalingCase("20-voters", 20);
  });
});

