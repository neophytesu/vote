/**
 * 测试用部署 fixture：部署公开投票所需中心与工厂（不含 Semaphore/Anonymous/Encrypted）
 * 供 PublicVoting、VotingFactory、Registration、ExecutionCenter 等测试复用
 */
import type { PublicClient, WalletClient } from "viem";

const PRIVACY_PUBLIC = 0;
const REG_RULE_OPEN = 0;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export type DeployFixtureResult = {
  votingFactory: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>>; write: Record<string, (...args: unknown[]) => Promise<`0x${string}`>> };
  registrationCenter: { address: `0x${string}`; write: Record<string, (...args: unknown[]) => Promise<unknown>> };
  votingCenter: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>> };
  revealCenter: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>> };
  statisticsCenter: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>>; write: Record<string, (...args: unknown[]) => Promise<unknown>> };
  queryCenter: { address: `0x${string}`; read: Record<string, (...args: unknown[]) => Promise<unknown>> };
  publicClient: PublicClient;
  walletClients: WalletClient[];
  networkHelpers: { time: { increase: (seconds: number) => Promise<void> } };
};

type ContractBase = { address: `0x${string}`; write: Record<string, (...args: unknown[]) => Promise<unknown>> };
type ContractWithRead = ContractBase & { read: Record<string, (...args: unknown[]) => Promise<unknown>> };

export async function deployPublicVotingFixture(conn: {
  viem: { getPublicClient: () => Promise<PublicClient | undefined>; getWalletClients: () => Promise<WalletClient[] | undefined>; deployContract: (name: string, args?: unknown[]) => Promise<ContractBase | ContractWithRead> };
  networkHelpers: { time: { increase: (seconds: number) => Promise<void> } };
}): Promise<DeployFixtureResult> {
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  if (!publicClient || !networkHelpers || !walletClients?.[0]) {
    throw new Error("Missing viem clients or networkHelpers");
  }

  // core 先部署，中心构造函数注入 votingCore，避免 setVotingCore 被抢先调用
  const votingFactory = (await viem.deployContract("VotingFactory", [])) as DeployFixtureResult["votingFactory"];

  const registrationCenter = (await viem.deployContract("RegistrationCenter", [votingFactory.address])) as ContractBase;
  const votingCenter = (await viem.deployContract("VotingCenter", [votingFactory.address, registrationCenter.address])) as ContractWithRead;
  const revealCenter = (await viem.deployContract("RevealCenter", [votingFactory.address])) as ContractWithRead;
  const statisticsCenter = (await viem.deployContract("StatisticsCenter", [votingFactory.address])) as ContractWithRead;

  await votingFactory.write.setCenters([
    registrationCenter.address,
    votingCenter.address,
    revealCenter.address,
    statisticsCenter.address,
  ]);
  const queryCenter = (await viem.deployContract("QueryCenter", [votingFactory.address])) as DeployFixtureResult["queryCenter"];

  return {
    votingFactory,
    registrationCenter: registrationCenter as DeployFixtureResult["registrationCenter"],
    votingCenter: votingCenter as DeployFixtureResult["votingCenter"],
    revealCenter: revealCenter as DeployFixtureResult["revealCenter"],
    statisticsCenter: statisticsCenter as DeployFixtureResult["statisticsCenter"],
    queryCenter,
    publicClient,
    walletClients: walletClients as WalletClient[],
    networkHelpers,
  };
}

/**
 * 仅部署未配置中心的 VotingFactory（用于测试 setCenters/centersConfigured 相关负路径）
 */
export async function deployUnconfiguredCoreFixture(conn: {
  viem: { getPublicClient: () => Promise<PublicClient | undefined>; getWalletClients: () => Promise<WalletClient[] | undefined>; deployContract: (name: string, args?: unknown[]) => Promise<ContractBase | ContractWithRead> };
}): Promise<{
  votingFactory: DeployFixtureResult["votingFactory"];
  publicClient: PublicClient;
}> {
  const { viem } = conn;
  const publicClient = await viem.getPublicClient();
  const votingFactory = (await viem.deployContract("VotingFactory", [])) as DeployFixtureResult["votingFactory"];
  return { votingFactory, publicClient: publicClient! };
}

/** 默认创建参数（公开投票、无执行），时间基于当前区块 */
export function defaultCreateParams(now: number, overrides: Record<string, unknown> = {}) {
  const regStart = BigInt(now + 60);
  const regEnd = BigInt(now + 300);
  const voteStart = BigInt(now + 300);
  const voteEnd = BigInt(now + 600);
  return {
    title: "公开投票测试",
    description: "测试公开投票流程",
    options: ["选项A", "选项B"],
    votingRule: 0, // SimpleMajority
    privacyLevel: PRIVACY_PUBLIC,
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
    tokenContractAddress: ZERO_ADDRESS,
    tokenMinBalance: 0n,
    useBlockNumber: false,
    allowExtension: true,
    snapshotBlockNumber: 0n,
    executionMode: 0, // None
    executionTarget: ZERO_ADDRESS,
    executionValue: 0n,
    executionCalldata: "0x" as `0x${string}`,
    executionOnWinningOption: 0n,
    executionMultisig: ZERO_ADDRESS,
    executionTimelockDelay: 0n,
    useThresholdDecryption: false,
    thresholdCommittee: [] as readonly `0x${string}`[],
    thresholdT: 0,
    revealDelay: 0n,
    ...overrides,
  };
}
