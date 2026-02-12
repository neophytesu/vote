import { useState, useCallback } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  VotingFactoryABI,
  QueryCenterABI,
  RegistrationCenterABI,
  VotingState,
  VotingRule,
  PrivacyLevel,
  RegistrationRule,
  getContractAddresses,
} from "@/contracts/abi";

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
    };
  };

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
        return parseVotingDetails(data);
      } catch (err) {
        console.error("获取投票失败:", err);
        return null;
      }
    },
    [getQueryContract]
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
        votings.push(parseVotingDetails(data));
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
  }, [getReadOnlyContract, getQueryContract]);

  /**
   * 获取最近的投票
   */
  const getRecentVotings = useCallback(
    async (count: number): Promise<VotingDetails[]> => {
      try {
        const contract = await getQueryContract();
        const data = await contract.getRecentVotings(count);
        return data.map(parseVotingDetails);
      } catch (err) {
        console.error("获取最近投票失败:", err);
        return [];
      }
    },
    [getQueryContract]
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
          votings.push(parseVotingDetails(data));
        }

        return votings;
      } catch (err) {
        console.error("获取创建的投票失败:", err);
        return [];
      }
    },
    [getQueryContract]
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
          votings.push(parseVotingDetails(data));
        }

        return votings;
      } catch (err) {
        console.error("获取参与的投票失败:", err);
        return [];
      }
    },
    [getQueryContract]
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
    createVoting,
    startRegistration,
    cancelVoting,
    extendRegistrationEnd,
    extendVotingEnd,
    getBlockNumber,
    getChainTimestamp,
    registerVoter,
    registerVoterWeighted,
    approveRegistration,
    batchApproveRegistrations,
    rejectRegistration,
    getPendingVoters,
    getUserFullStatus,
    startVoting,
    castVote,
    castQuadraticVote,
    castRankedVote,
    startTallying,
    revealResult,
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

