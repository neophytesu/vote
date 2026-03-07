/**
 * Gas 基准测试：createVoting 不同配置下的 Gas 消耗
 */
import { describe, it } from "node:test";
import { network } from "hardhat";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "../fixtures/deploy.js";

const VOTING_RULE_SIMPLE = 0;
const VOTING_RULE_WEIGHTED = 1;
const VOTING_RULE_QUADRATIC = 2;
const VOTING_RULE_RANKED = 3;

describe("Gas/CreateVoting", async () => {
  const conn = await network.connect("hardhat");
  const { votingFactory, publicClient } = await deployPublicVotingFixture(conn);

  async function measureCreateVoting(
    label: string,
    overrides: Record<string, unknown>
  ) {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, overrides);
    const hash = await votingFactory.write.createVoting([params]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // 直接打印到控制台，便于人工记录到论文
    // eslint-disable-next-line no-console
    console.log(
      `[Gas][createVoting][${label}] gasUsed=`,
      receipt.gasUsed.toString()
    );
  }

  it("记录公开投票在不同规则/配置下的 createVoting Gas", async () => {
    await measureCreateVoting("public-simple", {
      votingRule: VOTING_RULE_SIMPLE,
      title: "Gas-公开-简单多数",
    });

    await measureCreateVoting("public-weighted", {
      votingRule: VOTING_RULE_WEIGHTED,
      title: "Gas-公开-加权",
      options: ["A", "B", "C"],
      weightGroupNames: ["普通", "高级"],
      weightGroupWeights: [1n, 3n],
    });

    await measureCreateVoting("public-quadratic", {
      votingRule: VOTING_RULE_QUADRATIC,
      title: "Gas-公开-二次方",
      options: ["A", "B", "C"],
    });

    await measureCreateVoting("public-ranked", {
      votingRule: VOTING_RULE_RANKED,
      title: "Gas-公开-排序选择",
      options: ["X", "Y", "Z"],
    });
  });
});

