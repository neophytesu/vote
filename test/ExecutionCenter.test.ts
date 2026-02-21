/**
 * ExecutionCenter 测试 - 4 种执行模式：None、OnChainAuto、MultiSig、Timelock
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeFunctionData } from "viem";
import {
  deployPublicVotingFixture,
  defaultCreateParams,
} from "./fixtures/deploy.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

/** 通用流程：注册 -> 投票选项0 -> 揭示 */
async function runVotingFlow(
  votingFactory: { write: Record<string, (...args: unknown[]) => Promise<`0x${string}`>>; read: Record<string, (...args: unknown[]) => Promise<bigint>> },
  votingId: bigint,
  publicClient: { waitForTransactionReceipt: (o: { hash: `0x${string}` }) => Promise<unknown> },
  networkHelpers: { time: { increase: (s: number) => Promise<void> } },
  deployer: { account: { address: `0x${string}` } },
  voter1: { account: { address: `0x${string}` } }
) {
  await networkHelpers.time.increase(61);
  await votingFactory.write.registerVoter([votingId], { account: deployer.account });
  await publicClient.waitForTransactionReceipt({ hash: await votingFactory.write.registerVoter([votingId], { account: voter1.account }) });
  await networkHelpers.time.increase(250);
  await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
  await publicClient.waitForTransactionReceipt({ hash: await votingFactory.write.castVote([votingId, 0n], { account: voter1.account }) });
  await networkHelpers.time.increase(310);
  await votingFactory.write.revealResult([votingId], { account: deployer.account });
}

describe("ExecutionCenter", async function () {
  const conn = await network.connect("hardhat");
  const {
    votingFactory,
    revealCenter,
    publicClient,
    networkHelpers,
  } = await deployPublicVotingFixture(conn);

  const executionCenter = await conn.viem.deployContract("ExecutionCenter", [
    votingFactory.address,
    revealCenter.address,
  ]);
  await votingFactory.write.setExecutionCenter([executionCenter.address]);

  const walletClients = (await conn.viem.getWalletClients())!;
  const deployer = walletClients[0];
  const voter1 = walletClients[1];
  const other = walletClients[2];
  if (!deployer || !voter1 || !other) throw new Error("Need at least 3 wallet clients");

  it("None: 无执行配置，canExecute 返回 No execution config", async function () {
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const params = defaultCreateParams(now, {
      title: "None 模式",
      quorum: 1n,
      executionMode: 0,
      executionTarget: ZERO_ADDRESS,
      executionCalldata: "0x" as `0x${string}`,
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await runVotingFlow(votingFactory, votingId, publicClient, networkHelpers, deployer, voter1);
    const [canExec, reason] = await executionCenter.read.canExecute([votingId]);
    assert.equal(canExec, false, "None 模式应不可执行");
    assert.ok(/No execution config|no config/i.test(reason), `reason 应提及无配置: ${reason}`);
  });

  it("OnChainAuto: 提案通过且胜出选项匹配时任何人可 execute，target 被调用", async function () {
    const mockTarget = await conn.viem.deployContract("MockExecutionTarget");
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const setExecutedCalldata = encodeFunctionData({
      abi: [{ inputs: [], name: "setExecuted", outputs: [], stateMutability: "payable", type: "function" }],
      functionName: "setExecuted",
    });
    const params = defaultCreateParams(now, {
      title: "执行测试",
      quorum: 1n,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
      executionMode: 1,
      executionTarget: mockTarget.address as `0x${string}`,
      executionValue: 0n,
      executionCalldata: setExecutedCalldata as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: ZERO_ADDRESS,
      executionTimelockDelay: 0n,
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await runVotingFlow(votingFactory, votingId, publicClient, networkHelpers, deployer, voter1);

    const [canExec, reason] = await executionCenter.read.canExecute([votingId]);
    assert.ok(canExec, `canExecute 应为 true: ${reason}`);

    await executionCenter.write.execute([votingId], { account: other.account });
    const executed = await mockTarget.read.executed();
    assert.ok(executed, "Mock 应已被调用");

    const configResult = await executionCenter.read.getExecutionConfig([votingId]);
    assert.ok(configResult[10], "executed[votingId] 应为 true");

    await assert.rejects(
      () => executionCenter.write.execute([votingId], { account: other.account }),
      /Already executed|revert|fail/i
    );
  });

  it("canExecute 未揭示时返回 false", async function () {
    const mockTarget = await conn.viem.deployContract("MockExecutionTarget");
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const setExecutedCalldata = encodeFunctionData({
      abi: [{ inputs: [], name: "setExecuted", outputs: [], stateMutability: "payable", type: "function" }],
      functionName: "setExecuted",
    });
    const params = defaultCreateParams(now, {
      title: "未揭示执行",
      quorum: 0n,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
      executionMode: 1,
      executionTarget: mockTarget.address as `0x${string}`,
      executionValue: 0n,
      executionCalldata: setExecutedCalldata as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: ZERO_ADDRESS,
      executionTimelockDelay: 0n,
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await networkHelpers.time.increase(61);
    await votingFactory.write.registerVoter([votingId], { account: deployer.account });
    await networkHelpers.time.increase(250);
    await votingFactory.write.castVote([votingId, 0n], { account: deployer.account });
    await networkHelpers.time.increase(310);
    const [canExec, reason] = await executionCenter.read.canExecute([votingId]);
    assert.equal(canExec, false, "未揭示应不可执行");
    assert.ok(/not revealed|Result not revealed/i.test(reason), `reason 应提及未揭示: ${reason}`);
  });

  it("MultiSig: 仅多签地址可执行，canExecuteFor 正确区分", async function () {
    const mockTarget = await conn.viem.deployContract("MockExecutionTarget");
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const setExecutedCalldata = encodeFunctionData({
      abi: [{ inputs: [], name: "setExecuted", outputs: [], stateMutability: "payable", type: "function" }],
      functionName: "setExecuted",
    });
    const multisigAddr = voter1.account.address;
    const params = defaultCreateParams(now, {
      title: "MultiSig 执行",
      quorum: 1n,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
      executionMode: 2,
      executionTarget: mockTarget.address as `0x${string}`,
      executionValue: 0n,
      executionCalldata: setExecutedCalldata as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: multisigAddr as `0x${string}`,
      executionTimelockDelay: 0n,
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await runVotingFlow(votingFactory, votingId, publicClient, networkHelpers, deployer, voter1);

    const [canExecDeployer] = await executionCenter.read.canExecuteFor([votingId, deployer.account.address]);
    const [canExecMultisig] = await executionCenter.read.canExecuteFor([votingId, multisigAddr]);
    const [canExecOther] = await executionCenter.read.canExecuteFor([votingId, other.account.address]);
    assert.equal(canExecDeployer, false, "deployer 应不可执行");
    assert.equal(canExecMultisig, true, "多签地址应可执行");
    assert.equal(canExecOther, false, "other 应不可执行");

    await assert.rejects(
      () => executionCenter.write.execute([votingId], { account: deployer.account }),
      /Only multisig|multisig can execute/i
    );
    await assert.rejects(
      () => executionCenter.write.execute([votingId], { account: other.account }),
      /Only multisig|multisig can execute/i
    );

    await executionCenter.write.execute([votingId], { account: voter1.account });
    const executed = await mockTarget.read.executed();
    assert.ok(executed, "多签地址执行后 Mock 应已被调用");
  });

  it("Timelock: 延迟期内不可执行，延迟后任何人可执行", async function () {
    const mockTarget = await conn.viem.deployContract("MockExecutionTarget");
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const timelockDelay = 120;
    const setExecutedCalldata = encodeFunctionData({
      abi: [{ inputs: [], name: "setExecuted", outputs: [], stateMutability: "payable", type: "function" }],
      functionName: "setExecuted",
    });
    const params = defaultCreateParams(now, {
      title: "Timelock 执行",
      quorum: 1n,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
      executionMode: 3,
      executionTarget: mockTarget.address as `0x${string}`,
      executionValue: 0n,
      executionCalldata: setExecutedCalldata as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: ZERO_ADDRESS,
      executionTimelockDelay: BigInt(timelockDelay),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await runVotingFlow(votingFactory, votingId, publicClient, networkHelpers, deployer, voter1);

    const [canExecBefore] = await executionCenter.read.canExecute([votingId]);
    assert.equal(canExecBefore, false, "延迟期内应不可执行");

    await networkHelpers.time.increase(timelockDelay + 1);
    const [canExecAfter] = await executionCenter.read.canExecute([votingId]);
    assert.equal(canExecAfter, true, "延迟过后应可执行");

    await executionCenter.write.execute([votingId], { account: other.account });
    const executed = await mockTarget.read.executed();
    assert.ok(executed, "执行后 Mock 应已被调用");
  });

  it("Timelock: 创建者可在延迟期内取消", async function () {
    const mockTarget = await conn.viem.deployContract("MockExecutionTarget");
    const block = await publicClient.getBlock();
    const now = Number(block.timestamp);
    const timelockDelay = 120;
    const setExecutedCalldata = encodeFunctionData({
      abi: [{ inputs: [], name: "setExecuted", outputs: [], stateMutability: "payable", type: "function" }],
      functionName: "setExecuted",
    });
    const params = defaultCreateParams(now, {
      title: "Timelock 取消",
      quorum: 1n,
      registrationStart: BigInt(now + 60),
      registrationEnd: BigInt(now + 180),
      votingStart: BigInt(now + 180),
      votingEnd: BigInt(now + 360),
      executionMode: 3,
      executionTarget: mockTarget.address as `0x${string}`,
      executionValue: 0n,
      executionCalldata: setExecutedCalldata as `0x${string}`,
      executionOnWinningOption: 0n,
      executionMultisig: ZERO_ADDRESS,
      executionTimelockDelay: BigInt(timelockDelay),
    });
    await votingFactory.write.createVoting([params]);
    const votingId = await votingFactory.read.votingCount();
    await runVotingFlow(votingFactory, votingId, publicClient, networkHelpers, deployer, voter1);

    await executionCenter.write.cancelTimelock([votingId], { account: deployer.account });

    await networkHelpers.time.increase(timelockDelay + 1);
    const [canExecAfter] = await executionCenter.read.canExecute([votingId]);
    assert.equal(canExecAfter, false, "取消后应不可执行");

    await assert.rejects(
      () => executionCenter.write.execute([votingId], { account: deployer.account })
    );
    const executed = await mockTarget.read.executed();
    assert.equal(executed, false, "取消后 Mock 不应被调用");
  });
});
