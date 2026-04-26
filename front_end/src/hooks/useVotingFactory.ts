import { useState, useCallback } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  VotingFactoryABI,
  AnonymousVotingABI,
  EncryptedVotingABI,
  QueryCenterABI,
  RegistrationCenterABI,
  ExecutionCenterABI,
  VotingCenterABI,
  StatisticsCenterABI,
  VotingState,
  VotingRule,
  PrivacyLevel,
  RegistrationRule,
  getContractAddresses,
} from "@/contracts/abi";
import { fetchFullPrivacyBallotHexes } from "@/utils/fullPrivacyTally";
import {
  aggregateEncryptedBallots,
  decryptTally,
  deserializePrivateKey,
  parsePublicKeyFromDescription,
  type PaillierPrivateKeyJson,
} from "@/utils/paillierVoting";

/**
 * 投票详情接口（来自合约）
 */
export interface VotingDetails {
  id: number;
  creator: string;
  title: string;
  description: string;
  options: string[];
  votingRule: VotingRule;
  privacyLevel: PrivacyLevel;
  state: VotingState;
  registrationStart: number;
  registrationEnd: number;
  votingStart: number;
  votingEnd: number;
  quorum: number;
  totalVoters: number;
  totalVotes: number;
  voteCounts: number[];
  /** 加密/完全隐私：解密计票写入前，链上可见的已提交选票数（FullPrivacy=encryptedBallotCount；Encrypted=统计中心 voteCount） */
  opaqueBallotsCast?: number;
  resultRevealed: boolean;
  createdAt: number;
  autoAdvance: boolean;  // 是否自动推进状态
  visibilityBitmap: number;  // 可见性配置位图
  weightGroupNames: string[];    // 加权投票：权重分组名称
  weightGroupWeights: number[];  // 加权投票：权重分组权重值
  registrationRule: RegistrationRule;  // 注册规则
  tokenContractAddress: string;  // NFT/Token 合约地址
  tokenMinBalance: number;       // 最低持有数量
  useBlockNumber?: boolean;      // 时间控制：true=用区块高度，false=用时间戳
  allowExtension?: boolean;     // 是否允许动态延长注册期/投票期
  snapshotBlockNumber?: number; // 快照区块（0=当前余额）
  useThresholdDecryption?: boolean;
  thresholdT?: number;
  thresholdCommittee?: string[];
  revealDelay?: number; // 结果揭示延迟：useBlockNumber 时为区块数，否则为秒数
}

/**
 * 创建投票参数
 */
export interface CreateVotingParams {
  title: string;
  description: string;
  options: string[];
  votingRule: VotingRule;
  privacyLevel: PrivacyLevel;
  registrationStart: number;
  registrationEnd: number;
  votingStart: number;
  votingEnd: number;
  quorum: number;
  autoAdvance: boolean;  // 是否自动推进状态
  visibilityBitmap: number;  // 可见性配置位图
  enableWhitelist: boolean;  // 是否启用白名单
  whitelist: string[];  // 白名单地址列表
  whitelistGroupIndexes: number[];  // 白名单地址对应的权重分组索引
  weightGroupNames: string[];    // 加权投票：权重分组名称
  weightGroupWeights: number[];  // 加权投票：权重分组权重值
  registrationRule: RegistrationRule;  // 注册规则
  tokenContractAddress: string;  // NFT/Token 合约地址
  tokenMinBalance: number;       // 最低持有数量
  useBlockNumber?: boolean;      // 时间控制：true=用区块高度，false=用时间戳
  allowExtension?: boolean;      // 是否允许动态延长注册期/投票期
  snapshotBlockNumber?: number;  // 快照区块（0=当前余额；>0 时按该区块 Token 余额计资格与权重，需 Token 支持 getPastVotes）
  // 执行机制：0=链下通知 1=链上自动 2=多签 3=Timelock
  executionMode?: number;
  executionTarget?: string;      // 目标合约地址（空表示不启用）
  executionValue?: number | bigint;  // 转账金额（wei）
  executionCalldata?: string;    // 调用数据（hex）
  executionOnWinningOption?: number;  // 胜出选项索引（默认 0=赞成时执行）
  executionMultisig?: string;    // MultiSig 模式：多签钱包地址
  executionTimelockDelay?: number;    // Timelock 模式：延迟秒数
  // 加密/完全隐私投票可选：阈值解密（t-of-n 委员会确认计票结果）
  useThresholdDecryption?: boolean;
  thresholdCommittee?: string[];
  thresholdT?: number;
  revealDelay?: number; // 结果揭示延迟：useBlockNumber 时为区块数，否则为秒数
}

/**
 * Hook 状态
 */
interface UseVotingFactoryState {
  isLoading: boolean;
  error: string | null;
  votings: VotingDetails[];
}

/**
 * 使用投票工厂合约的 Hook
 */
export function useVotingFactory(chainId: number | null) {
  const [state, setState] = useState<UseVotingFactoryState>({
    isLoading: false,
    error: null,
    votings: [],
  });

  // 检查合约是否已部署
  const isContractDeployed = useCallback(() => {
    if (!chainId) return false;
    const addresses = getContractAddresses(chainId);
    return addresses.votingFactory !== "0x0000000000000000000000000000000000000000";
  }, [chainId]);

  // 获取合约实例（写操作）
  const getContract = useCallback(async () => {
    const t0 = performance.now();
    console.log("getContract: 开始");
    
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }

    const addresses = getContractAddresses(chainId);
    if (addresses.votingFactory === "0x0000000000000000000000000000000000000000") {
      throw new Error("合约尚未部署到当前网络");
    }

    console.log("getContract: 创建 provider...");
    const provider = new BrowserProvider(window.ethereum);
    
    console.log("getContract: 获取 signer...");
    const t1 = performance.now();
    const signer = await provider.getSigner();
    console.log(`getContract: getSigner 耗时 ${(performance.now() - t1).toFixed(0)}ms`);
    
    const contract = new Contract(addresses.votingFactory, VotingFactoryABI, signer);
    console.log(`getContract: 完成, 总耗时 ${(performance.now() - t0).toFixed(0)}ms`);
    return contract;
  }, [chainId]);

  // 获取只读合约实例（VotingFactory - 仅用于 votingCount 等最小查询）
  const getReadOnlyContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }

    const addresses = getContractAddresses(chainId);
    if (addresses.votingFactory === "0x0000000000000000000000000000000000000000") {
      throw new Error("合约尚未部署到当前网络");
    }

    const provider = new BrowserProvider(window.ethereum);
    return new Contract(addresses.votingFactory, VotingFactoryABI, provider);
  }, [chainId]);

  // 获取匿名投票合约实例（只读）
  const getAnonymousReadOnlyContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }
    const addresses = getContractAddresses(chainId);
    if (addresses.anonymousVoting === "0x0000000000000000000000000000000000000000") {
      throw new Error("AnonymousVoting 合约尚未部署到当前网络");
    }
    const provider = new BrowserProvider(window.ethereum);
    return new Contract(addresses.anonymousVoting, AnonymousVotingABI, provider);
  }, [chainId]);

  // 获取匿名投票合约实例（写操作）
  const getAnonymousContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }
    const addresses = getContractAddresses(chainId);
    if (addresses.anonymousVoting === "0x0000000000000000000000000000000000000000") {
      throw new Error("AnonymousVoting 合约尚未部署到当前网络");
    }
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new Contract(addresses.anonymousVoting, AnonymousVotingABI, signer);
  }, [chainId]);

  // 获取 Semaphore 合约地址（用于匿名投票拉取群组数据）
  const getSemaphoreAddress = useCallback(async (): Promise<string> => {
    const c = await getAnonymousReadOnlyContract();
    return c.semaphore() as Promise<string>;
  }, [getAnonymousReadOnlyContract]);

  // 获取加密投票合约地址（从 Factory 动态获取）
  const getEncryptedVotingAddress = useCallback(async (): Promise<string> => {
    const c = await getReadOnlyContract();
    const addr = (await c.encryptedVoting()) as string;
    if (!addr || addr === "0x0000000000000000000000000000000000000000") {
      throw new Error("EncryptedVoting 合约尚未配置到当前网络");
    }
    return addr;
  }, [getReadOnlyContract]);

  // 获取加密投票合约实例（写操作）
  const getEncryptedContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }
    const addr = await getEncryptedVotingAddress();
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new Contract(addr, EncryptedVotingABI, signer);
  }, [chainId, getEncryptedVotingAddress]);

  // 获取投票的 Semaphore 群组 ID（简单多数/排序选择）
  const getVotingSemaphoreGroupId = useCallback(
    async (votingId: number): Promise<number> => {
      const c = await getAnonymousReadOnlyContract();
      const id = await c.votingSemaphoreGroupId(votingId);
      return Number(id);
    },
    [getAnonymousReadOnlyContract]
  );

  // 获取加权投票的 Semaphore 群组 ID（按权重分组索引）
  const getVotingSemaphoreGroupIdByWeight = useCallback(
    async (votingId: number, groupIndex: number): Promise<number> => {
      const c = await getAnonymousReadOnlyContract();
      const id = await c.votingSemaphoreGroupIdByWeight(votingId, groupIndex);
      return Number(id);
    },
    [getAnonymousReadOnlyContract]
  );

  /** 简单多数/排序/二次方：是否已为该投票创建 Semaphore 主群组（groupId 可能为 0，属正常） */
  const hasSemaphoreGroup = useCallback(
    async (votingId: number): Promise<boolean> => {
      const c = await getAnonymousReadOnlyContract();
      return Boolean(await c.hasSemaphoreGroup(votingId));
    },
    [getAnonymousReadOnlyContract]
  );

  /** 加权：某权重分组是否已建群 */
  const isWeightGroupCreated = useCallback(
    async (votingId: number, groupIndex: number): Promise<boolean> => {
      const c = await getAnonymousReadOnlyContract();
      return Boolean(await c.isWeightGroupCreated(votingId, groupIndex));
    },
    [getAnonymousReadOnlyContract]
  );

  // 获取 Provider（用于查询事件等）
  const getProvider = useCallback(async () => {
    if (!window.ethereum || !chainId) throw new Error("请先连接钱包");
    const addresses = getContractAddresses(chainId);
    if (addresses.votingFactory === "0x0000000000000000000000000000000000000000")
      throw new Error("合约尚未部署到当前网络");
    return new BrowserProvider(window.ethereum);
  }, [chainId]);

  // 获取查询中心合约实例（所有只读查询走 QueryCenter）
  const getQueryContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }

    const addresses = getContractAddresses(chainId);
    if (addresses.queryCenter === "0x0000000000000000000000000000000000000000") {
      throw new Error("查询合约尚未部署到当前网络");
    }

    const provider = new BrowserProvider(window.ethereum);
    return new Contract(addresses.queryCenter, QueryCenterABI, provider);
  }, [chainId]);

  // 解析合约返回的投票数据
  const parseVotingDetails = (data: unknown): VotingDetails => {
    const d = data as {
      id: bigint;
      creator: string;
      title: string;
      description: string;
      options: string[];
      votingRule: number;
      privacyLevel: number;
      state: number;
      registrationStart: bigint;
      registrationEnd: bigint;
      votingStart: bigint;
      votingEnd: bigint;
      quorum: bigint;
      totalVoters: bigint;
      totalVotes: bigint;
      voteCounts: bigint[];
      resultRevealed: boolean;
      createdAt: bigint;
      autoAdvance: boolean;
      visibilityBitmap: bigint | number;
      weightGroupNames: string[];
      weightGroupWeights: bigint[];
      registrationRule: number;
      tokenContractAddress: string;
      tokenMinBalance: bigint;
      useBlockNumber?: boolean;
      allowExtension?: boolean;
      snapshotBlockNumber?: bigint;
      useThresholdDecryption?: boolean;
      thresholdT?: number | bigint;
      thresholdCommittee?: string[];
      revealDelay?: bigint;
    };

    return {
      id: Number(d.id),
      creator: d.creator,
      title: d.title,
      description: d.description,
      options: d.options,
      votingRule: Number(d.votingRule) as VotingRule,
      privacyLevel: Number(d.privacyLevel) as PrivacyLevel,
      state: Number(d.state) as VotingState,
      registrationStart: Number(d.registrationStart),
      registrationEnd: Number(d.registrationEnd),
      votingStart: Number(d.votingStart),
      votingEnd: Number(d.votingEnd),
      quorum: Number(d.quorum),
      totalVoters: Number(d.totalVoters),
      totalVotes: Number(d.totalVotes),
      voteCounts: d.voteCounts.map((c: bigint) => Number(c)),
      resultRevealed: d.resultRevealed,
      createdAt: Number(d.createdAt),
      autoAdvance: d.autoAdvance,
      visibilityBitmap: Number(d.visibilityBitmap),
      weightGroupNames: d.weightGroupNames ? [...d.weightGroupNames] : [],
      weightGroupWeights: d.weightGroupWeights ? d.weightGroupWeights.map((w: bigint) => Number(w)) : [],
      registrationRule: Number(d.registrationRule) as RegistrationRule,
      tokenContractAddress: d.tokenContractAddress || "0x0000000000000000000000000000000000000000",
      tokenMinBalance: Number(d.tokenMinBalance || 0),
      useBlockNumber: d.useBlockNumber ?? false,
      allowExtension: d.allowExtension ?? true,
      snapshotBlockNumber: d.snapshotBlockNumber != null ? Number(d.snapshotBlockNumber) : 0,
      useThresholdDecryption: d.useThresholdDecryption ?? false,
      thresholdT: d.thresholdT != null ? Number(d.thresholdT) : 0,
      thresholdCommittee: d.thresholdCommittee ? [...d.thresholdCommittee] : [],
      revealDelay: d.revealDelay != null ? Number(d.revealDelay) : 0,
    };
  };

  const enrichOpaqueBallots = useCallback(
    async (d: VotingDetails): Promise<VotingDetails> => {
      const zero = "0x0000000000000000000000000000000000000000";
      if (!chainId || typeof window === "undefined" || !window.ethereum) {
        return { ...d, opaqueBallotsCast: undefined };
      }
      if (
        d.resultRevealed ||
        (d.privacyLevel !== PrivacyLevel.Encrypted && d.privacyLevel !== PrivacyLevel.FullPrivacy)
      ) {
        return { ...d, opaqueBallotsCast: undefined };
      }
      if (d.totalVotes > 0) {
        return { ...d, opaqueBallotsCast: undefined };
      }
      const addresses = getContractAddresses(chainId);
      const provider = new BrowserProvider(window.ethereum);
      try {
        if (d.privacyLevel === PrivacyLevel.FullPrivacy) {
          if (addresses.votingCenter === zero) return { ...d, opaqueBallotsCast: undefined };
          const vc = new Contract(addresses.votingCenter, VotingCenterABI, provider);
          const n = (await vc.encryptedBallotCount(d.id)) as bigint;
          return { ...d, opaqueBallotsCast: Number(n) };
        }
        if (addresses.statisticsCenter === zero) return { ...d, opaqueBallotsCast: undefined };
        const sc = new Contract(addresses.statisticsCenter, StatisticsCenterABI, provider);
        const stats = (await sc.getVotingStats(d.id)) as { voteCount: bigint };
        return { ...d, opaqueBallotsCast: Number(stats.voteCount) };
      } catch {
        return { ...d, opaqueBallotsCast: undefined };
      }
    },
    [chainId]
  );

  /**
   * 创建新投票
   */
  const createVoting = useCallback(
    async (params: CreateVotingParams): Promise<number | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        console.log("useVotingFactory: 开始创建投票...");
        const contract = await getContract();
        console.log("useVotingFactory: 合约地址:", await contract.getAddress());
        console.log("useVotingFactory: 调用参数:", params);
        
        // 使用结构体参数调用
        const tx = await contract.createVoting({
          title: params.title,
          description: params.description,
          options: params.options,
          votingRule: params.votingRule,
          privacyLevel: params.privacyLevel,
          registrationStart: params.registrationStart,
          registrationEnd: params.registrationEnd,
          votingStart: params.votingStart,
          votingEnd: params.votingEnd,
          quorum: params.quorum,
          autoAdvance: params.autoAdvance,
          visibilityBitmap: params.visibilityBitmap,
          enableWhitelist: params.enableWhitelist,
          whitelist: params.whitelist,
          whitelistGroupIndexes: params.whitelistGroupIndexes || [],
          weightGroupNames: params.weightGroupNames || [],
          weightGroupWeights: params.weightGroupWeights || [],
          registrationRule: params.registrationRule ?? 0,
          tokenContractAddress: params.tokenContractAddress || "0x0000000000000000000000000000000000000000",
          tokenMinBalance: params.tokenMinBalance || 0,
          useBlockNumber: params.useBlockNumber ?? false,
          allowExtension: params.allowExtension ?? true,
          snapshotBlockNumber: params.snapshotBlockNumber ?? 0,
          executionMode: params.executionMode ?? 0,
          executionTarget: params.executionTarget || "0x0000000000000000000000000000000000000000",
          executionValue: params.executionValue ?? 0,
          executionCalldata: params.executionCalldata || "0x",
          executionOnWinningOption: params.executionOnWinningOption ?? 0,
          executionMultisig: params.executionMultisig || "0x0000000000000000000000000000000000000000",
          executionTimelockDelay: params.executionTimelockDelay ?? 0,
          useThresholdDecryption: params.useThresholdDecryption ?? false,
          thresholdCommittee: params.thresholdCommittee ?? [],
          thresholdT: params.thresholdT ?? 0,
          revealDelay: params.revealDelay ?? 0,
        });
        
        console.log("useVotingFactory: 交易已发送, hash:", tx.hash);
        const receipt = await tx.wait();
        console.log("useVotingFactory: 交易已确认");

        // 从事件中获取投票ID
        const event = receipt.logs.find(
          (log: { fragment?: { name: string } }) => log.fragment?.name === "VotingCreated"
        );
        const votingId = event?.args?.[0];

        setState((prev) => ({ ...prev, isLoading: false }));
        return votingId ? Number(votingId) : null;
      } catch (err) {
        console.error("useVotingFactory: 创建投票失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "创建投票失败",
        }));
        return null;
      }
    },
    [getContract]
  );

  /**
   * 开始注册阶段
   */
  const startRegistration = useCallback(
    async (votingId: number): Promise<boolean> => {
      const t0 = performance.now();
      console.log("startRegistration: 开始, votingId:", votingId);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log(`startRegistration: 获取合约成功, 耗时 ${(performance.now() - t0).toFixed(0)}ms`);
        
        const t1 = performance.now();
        console.log("startRegistration: 发送交易 (等待 MetaMask)...");
        const tx = await contract.startRegistration(votingId);
        console.log(`startRegistration: 交易已发送, 耗时 ${(performance.now() - t1).toFixed(0)}ms, hash:`, tx.hash);
        
        const t2 = performance.now();
        await tx.wait();
        console.log(`startRegistration: 交易已确认, 耗时 ${(performance.now() - t2).toFixed(0)}ms`);
        console.log(`startRegistration: 总耗时 ${(performance.now() - t0).toFixed(0)}ms`);
        
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("startRegistration: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "开始注册失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 取消投票
   */
  const cancelVoting = useCallback(
    async (votingId: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getContract();
        const tx = await contract.cancelVoting(votingId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "取消投票失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 延长注册截止时间
   */
  const extendRegistrationEnd = useCallback(
    async (votingId: number, newEnd: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getContract();
        const tx = await contract.extendRegistrationEnd(votingId, newEnd);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "延长注册期失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 延长投票截止时间
   */
  const extendVotingEnd = useCallback(
    async (votingId: number, newEnd: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getContract();
        const tx = await contract.extendVotingEnd(votingId, newEnd);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "延长投票期失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 获取当前区块高度（用于区块时间模式）
   */
  const getBlockNumber = useCallback(async (): Promise<number | null> => {
    try {
      const queryContract = await getQueryContract();
      const provider = queryContract.runner?.provider;
      if (!provider) return null;
      const block = await provider.getBlock("latest");
      return block?.number ?? null;
    } catch {
      return null;
    }
  }, [getQueryContract]);

  /**
   * 获取链上当前时间戳（最新区块的 timestamp，用于时间戳模式）
   * 本地 Hardhat 节点：block.timestamp 仅随出块推进，与 Date.now() 不同步
   */
  const getChainTimestamp = useCallback(async (): Promise<number | null> => {
    try {
      const queryContract = await getQueryContract();
      const provider = queryContract.runner?.provider;
      if (!provider) return null;
      const block = await provider.getBlock("latest");
      return block?.timestamp != null ? Number(block.timestamp) : null;
    } catch {
      return null;
    }
  }, [getQueryContract]);

  /**
   * 注册选民
   */
  const registerVoter = useCallback(
    async (votingId: number): Promise<boolean> => {
      console.log("registerVoter: 开始, votingId:", votingId);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log("registerVoter: 获取合约成功");
        const tx = await contract.registerVoter(votingId);
        console.log("registerVoter: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("registerVoter: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("registerVoter: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "注册失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 注册选民（加权投票 - 选择权重分组）
   */
  const registerVoterWeighted = useCallback(
    async (votingId: number, groupIndex: number): Promise<boolean> => {
      console.log("registerVoterWeighted: 开始, votingId:", votingId, "groupIndex:", groupIndex);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log("registerVoterWeighted: 获取合约成功");
        const tx = await contract.registerVoterWeighted(votingId, groupIndex);
        console.log("registerVoterWeighted: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("registerVoterWeighted: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("registerVoterWeighted: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "加权注册失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 匿名投票 - 注册选民（提交身份承诺）
   */
  const registerVoterAnonymous = useCallback(
    async (votingId: number, identityCommitment: bigint): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const tx = await contract.registerVoterAnonymous(votingId, identityCommitment);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "匿名注册失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 匿名加权投票 - 注册选民（身份承诺 + 权重分组）
   */
  const registerVoterAnonymousWeighted = useCallback(
    async (votingId: number, identityCommitment: bigint, groupIndex: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const tx = await contract.registerVoterAnonymousWeighted(votingId, identityCommitment, groupIndex);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "匿名加权注册失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 匿名投票 - 提交 ZK 证明
   */
  const castVoteAnonymous = useCallback(
    async (
      votingId: number,
      optionIndex: number,
      proof: {
        merkleTreeDepth: number;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
      }
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const proofTuple = {
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        };
        const tx = await contract.castVoteAnonymous(votingId, optionIndex, proofTuple);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "匿名投票失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 匿名加权投票 - 提交 ZK 证明
   */
  const castVoteAnonymousWeighted = useCallback(
    async (
      votingId: number,
      optionIndex: number,
      groupIndex: number,
      proof: {
        merkleTreeDepth: number;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
      }
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const proofTuple = {
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        };
        const tx = await contract.castVoteAnonymousWeighted(votingId, optionIndex, groupIndex, proofTuple);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "匿名加权投票失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 匿名排序选择投票 - 提交 ZK 证明（message = 编码排名）
   */
  const castVoteAnonymousRanked = useCallback(
    async (
      votingId: number,
      encodedRanking: bigint,
      proof: {
        merkleTreeDepth: number;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
      }
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const proofTuple = {
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        };
        const tx = await contract.castVoteAnonymousRanked(votingId, encodedRanking, proofTuple);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "匿名排序投票失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 匿名二次方投票 - 提交 ZK 证明（message = 编码票数）
   */
  const castVoteAnonymousQuadratic = useCallback(
    async (
      votingId: number,
      encodedVote: bigint,
      proof: {
        merkleTreeDepth: number;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
      }
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const proofTuple = {
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        };
        const tx = await contract.castVoteAnonymousQuadratic(votingId, encodedVote, proofTuple);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "匿名二次方投票失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 加密投票 - 提交同态加密选票（Encrypted 隐私级别）
   */
  const castVoteEncrypted = useCallback(
    async (votingId: number, encryptedBallotHex: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getEncryptedContract();
        const tx = await contract.castVoteEncrypted(votingId, encryptedBallotHex);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "加密投票失败",
        }));
        return false;
      }
    },
    [getEncryptedContract]
  );

  /**
   * 提交计票结果（加密投票/完全隐私 - 创建者或委员会）
   */
  const submitTallyResult = useCallback(
    async (votingId: number, totalBallots: number, decryptedCounts: number[]): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getEncryptedContract();
        const tx = await contract.submitTallyResult(votingId, totalBallots, decryptedCounts);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "提交计票失败",
        }));
        return false;
      }
    },
    [getEncryptedContract]
  );

  /**
   * 委员会确认计票结果（阈值解密时）
   */
  const approveTallyResult = useCallback(
    async (votingId: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getEncryptedContract();
        const tx = await contract.approveTallyResult(votingId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "确认计票失败",
        }));
        return false;
      }
    },
    [getEncryptedContract]
  );

  /**
   * 完全隐私（简单多数 / 加权）：从链上拉取加密选票 → 同态聚合 → 本地 Paillier 解密 → EncryptedVoting.submitTallyResult
   * @param description 须含 <!--PAILLIER_PK:...-->（与链上一致）
   * @returns 同步返回 error 文案，避免调用方读到尚未更新的 React state
   */
  const submitFullPrivacyDecryptedTally = useCallback(
    async (
      votingId: number,
      description: string,
      optionCount: number
    ): Promise<{ ok: boolean; error: string | null }> => {
      const zero = "0x0000000000000000000000000000000000000000";
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        if (!chainId || typeof window === "undefined") {
          throw new Error("请先连接钱包");
        }
        const skRaw = localStorage.getItem(`paillier-sk-${votingId}`);
        if (!skRaw) {
          throw new Error("未找到 Paillier 私钥（创建投票时保存在本浏览器），无法解密计票");
        }
        if (!parsePublicKeyFromDescription(description)) {
          throw new Error("提案描述中未找到 Paillier 公钥");
        }
        const privateKey = deserializePrivateKey(JSON.parse(skRaw) as PaillierPrivateKeyJson);
        const publicKey = privateKey.publicKey;

        const provider = await getProvider();
        const addresses = getContractAddresses(chainId);
        if (!addresses.anonymousVoting || addresses.anonymousVoting === zero) {
          throw new Error("AnonymousVoting 未部署");
        }
        if (!addresses.votingCenter || addresses.votingCenter === zero) {
          throw new Error("VotingCenter 未部署");
        }

        const ballotHexes = await fetchFullPrivacyBallotHexes(
          provider,
          addresses.anonymousVoting,
          votingId,
          0
        );
        if (ballotHexes.length === 0) {
          throw new Error(
            "未从链上找到完全隐私选票（FullPrivacyBallotCast）。请确认：1）投票阶段已用当前网络成功投票；2）abi.ts 中 AnonymousVoting 含 castVoteFullPrivacy 与事件；3）前端合约地址与节点一致。"
          );
        }

        const vc = new Contract(addresses.votingCenter, VotingCenterABI, provider);
        const onChainCount = Number(await vc.encryptedBallotCount(votingId));
        if (onChainCount > 0 && ballotHexes.length !== onChainCount) {
          throw new Error(
            `链上加密选票数（${onChainCount}）与解析到的交易数（${ballotHexes.length}）不一致，请检查节点或稍后重试`
          );
        }

        const aggregated = aggregateEncryptedBallots(publicKey, ballotHexes);
        const counts = decryptTally(privateKey, aggregated);
        if (counts.length !== optionCount) {
          throw new Error(`解密得票项数为 ${counts.length}，与选项数 ${optionCount} 不符`);
        }
        const decryptedCounts = counts.map((c) => Math.max(0, Math.round(Number(c))));

        const enc = await getEncryptedContract();
        const tx = await enc.submitTallyResult(votingId, ballotHexes.length, decryptedCounts);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false, error: null }));
        return { ok: true, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("submitFullPrivacyDecryptedTally:", err);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: msg || "提交解密计票失败",
        }));
        return { ok: false, error: msg || "提交解密计票失败" };
      }
    },
    [chainId, getProvider, getEncryptedContract]
  );

  /**
   * 完全隐私投票 - Semaphore 证明 + 加密选票（简单多数/排序选择/二次方）
   */
  const castVoteFullPrivacy = useCallback(
    async (
      votingId: number,
      encryptedBallotHex: string,
      proof: {
        merkleTreeDepth: number;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
      }
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const proofTuple = {
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        };
        const tx = await contract.castVoteFullPrivacy(votingId, encryptedBallotHex, proofTuple);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "完全隐私投票失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 完全隐私加权投票 - Semaphore 证明 + 加密选票
   */
  const castVoteFullPrivacyWeighted = useCallback(
    async (
      votingId: number,
      encryptedBallotHex: string,
      groupIndex: number,
      proof: {
        merkleTreeDepth: number;
        merkleTreeRoot: bigint;
        nullifier: bigint;
        message: bigint;
        scope: bigint;
        points: bigint[];
      }
    ): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getAnonymousContract();
        const proofTuple = {
          merkleTreeDepth: proof.merkleTreeDepth,
          merkleTreeRoot: proof.merkleTreeRoot,
          nullifier: proof.nullifier,
          message: proof.message,
          scope: proof.scope,
          points: proof.points,
        };
        const tx = await contract.castVoteFullPrivacyWeighted(votingId, encryptedBallotHex, groupIndex, proofTuple);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "完全隐私加权投票失败",
        }));
        return false;
      }
    },
    [getAnonymousContract]
  );

  /**
   * 审批通过注册申请（仅创建者）
   */
  const approveRegistration = useCallback(
    async (votingId: number, voter: string): Promise<boolean> => {
      console.log("approveRegistration: 开始, votingId:", votingId, "voter:", voter);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.approveRegistration(votingId, voter);
        console.log("approveRegistration: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("approveRegistration: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("approveRegistration: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "审批注册失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 批量审批通过注册申请（仅创建者）
   */
  const batchApproveRegistrations = useCallback(
    async (votingId: number, voters: string[]): Promise<boolean> => {
      console.log("batchApproveRegistrations: 开始, votingId:", votingId, "voters:", voters.length);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.batchApproveRegistrations(votingId, voters);
        console.log("batchApproveRegistrations: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("batchApproveRegistrations: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("batchApproveRegistrations: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "批量审批失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 拒绝注册申请（仅创建者）
   */
  const rejectRegistration = useCallback(
    async (votingId: number, voter: string): Promise<boolean> => {
      console.log("rejectRegistration: 开始, votingId:", votingId, "voter:", voter);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.rejectRegistration(votingId, voter);
        console.log("rejectRegistration: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("rejectRegistration: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("rejectRegistration: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "拒绝注册失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 获取待审核选民列表
   */
  const getPendingVoters = useCallback(
    async (votingId: number): Promise<string[]> => {
      try {
        const contract = await getQueryContract();
        const list = await contract.getPendingVoters(votingId);
        return Array.isArray(list) ? list.map((a: string) => String(a)) : [];
      } catch (err) {
        console.error("获取待审核选民列表失败:", err);
        return [];
      }
    },
    [getQueryContract]
  );

  /**
   * 获取用户完整注册状态（已注册 / 待审核 / 已投票）
   */
  const getUserFullStatus = useCallback(
    async (
      votingId: number,
      address: string
    ): Promise<{ registered: boolean; pending: boolean; voted: boolean }> => {
      try {
        const contract = await getQueryContract();
        const [registered, pending, voted] = await contract.getUserFullStatus(
          votingId,
          address
        );
        return { registered, pending, voted };
      } catch {
        return { registered: false, pending: false, voted: false };
      }
    },
    [getQueryContract]
  );

  /**
   * 开始投票阶段
   */
  const startVoting = useCallback(
    async (votingId: number): Promise<boolean> => {
      console.log("startVoting: 开始, votingId:", votingId);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log("startVoting: 获取合约成功");
        const tx = await contract.startVoting(votingId);
        console.log("startVoting: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("startVoting: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("startVoting: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "开始投票失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 投票
   */
  const castVote = useCallback(
    async (votingId: number, optionIndex: number): Promise<boolean> => {
      console.log("castVote: 开始, votingId:", votingId, "optionIndex:", optionIndex);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log("castVote: 获取合约成功");
        const tx = await contract.castVote(votingId, optionIndex);
        console.log("castVote: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("castVote: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("castVote: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "投票失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 二次方投票（多选项分配积分）
   */
  const castQuadraticVote = useCallback(
    async (votingId: number, optionIndexes: number[], voteAmounts: number[]): Promise<boolean> => {
      console.log("castQuadraticVote: 开始, votingId:", votingId, "options:", optionIndexes, "amounts:", voteAmounts);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.castQuadraticVote(votingId, optionIndexes, voteAmounts);
        console.log("castQuadraticVote: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("castQuadraticVote: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("castQuadraticVote: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "二次方投票失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 开始计票
   */
  /**
   * 排序选择投票
   */
  const castRankedVote = useCallback(
    async (votingId: number, rankedOptions: number[]): Promise<boolean> => {
      console.log("castRankedVote: 开始, votingId:", votingId, "ranking:", rankedOptions);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.castRankedVote(votingId, rankedOptions);
        console.log("castRankedVote: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("castRankedVote: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("castRankedVote: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "排序选择投票失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  const startTallying = useCallback(
    async (votingId: number): Promise<boolean> => {
      console.log("startTallying: 开始, votingId:", votingId);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log("startTallying: 获取合约成功");
        const tx = await contract.startTallying(votingId);
        console.log("startTallying: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("startTallying: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("startTallying: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "开始计票失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 获取执行中心合约实例（用于提案通过后的链上执行）
   */
  const getExecutionContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }
    const addresses = getContractAddresses(chainId);
    if (!addresses.executionCenter || addresses.executionCenter === "0x0000000000000000000000000000000000000000") {
      throw new Error("执行中心未部署");
    }
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new Contract(addresses.executionCenter, ExecutionCenterABI, signer);
  }, [chainId]);

  /**
   * 检查提案是否可执行（传入 executor 以支持 MultiSig 模式判断当前钱包是否可执行）
   */
  const canExecuteProposal = useCallback(
    async (votingId: number, executor?: string): Promise<{ canExec: boolean; reason: string }> => {
      try {
        if (!chainId) return { canExec: false, reason: "未连接网络" };
        const addresses = getContractAddresses(chainId);
        if (!addresses.executionCenter || addresses.executionCenter === "0x0000000000000000000000000000000000000000") {
          return { canExec: false, reason: "执行中心未部署" };
        }
        const provider = new BrowserProvider(window.ethereum!);
        const contract = new Contract(addresses.executionCenter, ExecutionCenterABI, provider);
        let executorAddr = executor;
        if (!executorAddr && window.ethereum) {
          const signer = (await new BrowserProvider(window.ethereum).getSigner());
          executorAddr = await signer.getAddress();
        }
        const [canExec, reason] = executorAddr
          ? await contract.canExecuteFor(votingId, executorAddr)
          : await contract.canExecute(votingId);
        return { canExec, reason: reason || "" };
      } catch {
        return { canExec: false, reason: "查询失败" };
      }
    },
    [chainId]
  );

  /**
   * 取消 Timelock 执行（仅创建者在延迟期内可调用）
   */
  const cancelTimelockExecution = useCallback(
    async (votingId: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getExecutionContract();
        const tx = await contract.cancelTimelock(votingId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "取消失败",
        }));
        return false;
      }
    },
    [getExecutionContract]
  );

  /**
   * 执行提案（提案通过且胜出选项匹配时，执行预定义的链上操作）
   */
  const executeProposal = useCallback(
    async (votingId: number): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const contract = await getExecutionContract();
        const tx = await contract.execute(votingId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "执行失败",
        }));
        return false;
      }
    },
    [getExecutionContract]
  );

  /**
   * 揭示结果
   */
  const revealResult = useCallback(
    async (votingId: number): Promise<boolean> => {
      console.log("revealResult: 开始, votingId:", votingId);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        console.log("revealResult: 获取合约成功");
        const tx = await contract.revealResult(votingId);
        console.log("revealResult: 交易已发送, hash:", tx.hash);
        await tx.wait();
        console.log("revealResult: 交易已确认");
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
        console.error("revealResult: 失败:", err);
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "揭示结果失败",
        }));
        return false;
      }
    },
    [getContract]
  );

  /**
   * 获取单个投票详情
   */
  const getVoting = useCallback(
    async (votingId: number): Promise<VotingDetails | null> => {
      try {
        const contract = await getQueryContract();
        const data = await contract.getVoting(votingId);
        return enrichOpaqueBallots(parseVotingDetails(data));
      } catch (err) {
        console.error("获取投票失败:", err);
        return null;
      }
    },
    [getQueryContract, enrichOpaqueBallots]
  );

  /**
   * 获取所有投票
   */
  const getAllVotings = useCallback(async (): Promise<VotingDetails[]> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const factoryContract = await getReadOnlyContract();
      const queryContract = await getQueryContract();
      const count = await factoryContract.votingCount();
      const votings: VotingDetails[] = [];

      for (let i = 1; i <= Number(count); i++) {
        const data = await queryContract.getVoting(i);
        votings.push(await enrichOpaqueBallots(parseVotingDetails(data)));
      }

      setState((prev) => ({ ...prev, isLoading: false, votings }));
      return votings;
    } catch (err) {
      const error = err as Error;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "获取投票列表失败",
      }));
      return [];
    }
  }, [getReadOnlyContract, getQueryContract, enrichOpaqueBallots]);

  /**
   * 获取最近的投票
   */
  const getRecentVotings = useCallback(
    async (count: number): Promise<VotingDetails[]> => {
      try {
        const contract = await getQueryContract();
        const data = await contract.getRecentVotings(count);
        return await Promise.all(
          (data as unknown[]).map((row) => enrichOpaqueBallots(parseVotingDetails(row)))
        );
      } catch (err) {
        console.error("获取最近投票失败:", err);
        return [];
      }
    },
    [getQueryContract, enrichOpaqueBallots]
  );

  /**
   * 获取用户创建的投票
   */
  const getMyCreatedVotings = useCallback(
    async (address: string): Promise<VotingDetails[]> => {
      try {
        const contract = await getQueryContract();
        const ids = await contract.getVotingsByCreator(address);
        const votings: VotingDetails[] = [];

        for (const id of ids) {
          const data = await contract.getVoting(id);
          votings.push(await enrichOpaqueBallots(parseVotingDetails(data)));
        }

        return votings;
      } catch (err) {
        console.error("获取创建的投票失败:", err);
        return [];
      }
    },
    [getQueryContract, enrichOpaqueBallots]
  );

  /**
   * 获取用户参与的投票
   */
  const getMyParticipatedVotings = useCallback(
    async (address: string): Promise<VotingDetails[]> => {
      try {
        const contract = await getQueryContract();
        const ids = await contract.getVotingsByVoter(address);
        const votings: VotingDetails[] = [];

        for (const id of ids) {
          const data = await contract.getVoting(id);
          votings.push(await enrichOpaqueBallots(parseVotingDetails(data)));
        }

        return votings;
      } catch (err) {
        console.error("获取参与的投票失败:", err);
        return [];
      }
    },
    [getQueryContract, enrichOpaqueBallots]
  );

  /**
   * 获取用户在某个投票中的状态
   */
  const getUserVotingStatus = useCallback(
    async (
      votingId: number,
      address: string
    ): Promise<{ registered: boolean; voted: boolean }> => {
      try {
        const contract = await getQueryContract();
        const [registered, voted] = await contract.getUserVotingStatus(
          votingId,
          address
        );
        return { registered, voted };
      } catch {
        return { registered: false, voted: false };
      }
    },
    [getQueryContract]
  );

  /**
   * 获取投票结果
   */
  const getVotingResult = useCallback(
    async (
      votingId: number
    ): Promise<{
      voteCounts: number[];
      winningOption: number;
      totalVotes: number;
    } | null> => {
      try {
        const contract = await getQueryContract();
        const [voteCounts, winningOption, totalVotes] =
          await contract.getVotingResult(votingId);
        return {
          voteCounts: voteCounts.map((c: bigint) => Number(c)),
          winningOption: Number(winningOption),
          totalVotes: Number(totalVotes),
        };
      } catch {
        return null;
      }
    },
    [getQueryContract]
  );

  /**
   * 获取已注册选民列表（用于计算未投票的人）
   */
  const getRegisteredVoters = useCallback(
    async (votingId: number): Promise<string[]> => {
      if (!window.ethereum || !chainId) return [];
      const addresses = getContractAddresses(chainId);
      if (
        !addresses.registrationCenter ||
        addresses.registrationCenter === "0x0000000000000000000000000000000000000000"
      ) {
        return [];
      }
      try {
        const provider = new BrowserProvider(window.ethereum);
        const contract = new Contract(
          addresses.registrationCenter,
          RegistrationCenterABI,
          provider
        );
        const list = await contract.getRegisteredVoters(votingId);
        return Array.isArray(list) ? list.map((a: string) => String(a)) : [];
      } catch (err) {
        console.error("获取注册选民列表失败:", err);
        return [];
      }
    },
    [chainId]
  );

  /**
   * 获取投票记录（谁投了什么）
   */
  const getVoteRecords = useCallback(
    async (
      votingId: number
    ): Promise<{
      voters: string[];
      optionIndexes: number[];
      timestamps: number[];
    } | null> => {
      try {
        const contract = await getQueryContract();
        const [voters, optionIndexes, timestamps] =
          await contract.getVoteRecords(votingId);
        return {
          voters: voters as string[],
          optionIndexes: optionIndexes.map((i: bigint) => Number(i)),
          timestamps: timestamps.map((t: bigint) => Number(t)),
        };
      } catch {
        return null;
      }
    },
    [getQueryContract]
  );

  /**
   * 获取排序选择投票的完整记录（选民地址 + 完整排名 + 时间）
   */
  const getRankedVoteRecords = useCallback(
    async (
      votingId: number
    ): Promise<{
      voters: string[];
      rankings: number[][];
      timestamps: number[];
    } | null> => {
      try {
        const contract = await getQueryContract();
        const [voters, rankings, timestamps] =
          await contract.getRankedVoteRecords(votingId);
        return {
          voters: voters as string[],
          rankings: (rankings as bigint[][]).map((r: bigint[]) =>
            r.map((v: bigint) => Number(v))
          ),
          timestamps: (timestamps as bigint[]).map((t: bigint) => Number(t)),
        };
      } catch {
        return null;
      }
    },
    [getQueryContract]
  );

  /**
   * 获取特定选民的投票选择
   */
  const getVoterChoice = useCallback(
    async (
      votingId: number,
      voter: string
    ): Promise<{
      optionIndex: number;
      timestamp: number;
      voted: boolean;
    } | null> => {
      try {
        const contract = await getQueryContract();
        const [optionIndex, timestamp, voted] =
          await contract.getVoterChoice(votingId, voter);
        return {
          optionIndex: Number(optionIndex),
          timestamp: Number(timestamp),
          voted,
        };
      } catch {
        return null;
      }
    },
    [getQueryContract]
  );

  // 清除错误
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    isContractDeployed,
    getProvider,
    getSemaphoreAddress,
    getVotingSemaphoreGroupId,
    getVotingSemaphoreGroupIdByWeight,
    hasSemaphoreGroup,
    isWeightGroupCreated,
    createVoting,
    startRegistration,
    cancelVoting,
    extendRegistrationEnd,
    extendVotingEnd,
    getBlockNumber,
    getChainTimestamp,
    registerVoter,
    registerVoterAnonymous,
    registerVoterAnonymousWeighted,
    registerVoterWeighted,
    approveRegistration,
    batchApproveRegistrations,
    rejectRegistration,
    getPendingVoters,
    getUserFullStatus,
    startVoting,
    castVote,
    castVoteAnonymous,
    castVoteAnonymousWeighted,
    castVoteAnonymousRanked,
    castVoteAnonymousQuadratic,
    castVoteEncrypted,
    submitTallyResult,
    approveTallyResult,
    submitFullPrivacyDecryptedTally,
    castVoteFullPrivacy,
    castVoteFullPrivacyWeighted,
    getEncryptedVotingAddress,
    castQuadraticVote,
    castRankedVote,
    startTallying,
    revealResult,
    canExecuteProposal,
    executeProposal,
    cancelTimelockExecution,
    getVoting,
    getAllVotings,
    getRecentVotings,
    getMyCreatedVotings,
    getMyParticipatedVotings,
    getUserVotingStatus,
    getVotingResult,
    getVoteRecords,
    getRankedVoteRecords,
    getRegisteredVoters,
    getVoterChoice,
    clearError,
  };
}

