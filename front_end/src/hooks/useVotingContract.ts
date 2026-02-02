import { useState, useCallback, useEffect } from "react";
import { BrowserProvider, Contract } from "ethers";
import {
  VotingCoreABI,
  VotingState,
  VotingRule,
  PrivacyLevel,
  getContractAddresses,
} from "@/contracts/abi";

/**
 * 提案配置接口
 */
export interface ProposalConfig {
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
}

/**
 * 提案信息接口
 */
export interface Proposal {
  id: number;
  creator: string;
  config: ProposalConfig;
  state: VotingState;
  totalVoters: number;
  totalVotes: number;
  resultRevealed: boolean;
}

/**
 * 投票结果接口
 */
export interface VotingResult {
  voteCounts: number[];
  totalVotes: number;
  totalVoters: number;
  winningOption: number;
  winningVotes: number;
  isRevealed: boolean;
  passed: boolean;
  revealedAt: number;
}

/**
 * Hook 状态接口
 */
interface UseVotingContractState {
  isLoading: boolean;
  error: string | null;
  proposals: Proposal[];
  currentProposal: Proposal | null;
}

/**
 * 使用投票合约的 Hook
 */
export function useVotingContract(chainId: number | null) {
  const [state, setState] = useState<UseVotingContractState>({
    isLoading: false,
    error: null,
    proposals: [],
    currentProposal: null,
  });

  // 获取合约实例
  const getContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }

    const addresses = getContractAddresses(chainId);
    if (addresses.votingCore === "0x0000000000000000000000000000000000000000") {
      throw new Error("合约尚未部署到当前网络");
    }

    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    
    return new Contract(addresses.votingCore, VotingCoreABI, signer);
  }, [chainId]);

  // 获取只读合约实例
  const getReadOnlyContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }

    const addresses = getContractAddresses(chainId);
    if (addresses.votingCore === "0x0000000000000000000000000000000000000000") {
      throw new Error("合约尚未部署到当前网络");
    }

    const provider = new BrowserProvider(window.ethereum);
    return new Contract(addresses.votingCore, VotingCoreABI, provider);
  }, [chainId]);

  /**
   * 创建提案
   */
  const createProposal = useCallback(
    async (config: ProposalConfig) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.createProposal(config);
        const receipt = await tx.wait();

        // 从事件中获取提案ID
        const event = receipt.logs.find(
          (log: { fragment?: { name: string } }) => log.fragment?.name === "ProposalCreated"
        );
        const proposalId = event?.args?.[0];

        setState((prev) => ({ ...prev, isLoading: false }));
        return proposalId ? Number(proposalId) : null;
      } catch (err) {
        const error = err as Error;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error.message || "创建提案失败",
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
    async (proposalId: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.startRegistration(proposalId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
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
   * 注册选民
   */
  const registerVoter = useCallback(
    async (proposalId: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.registerVoter(proposalId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
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
   * 开始投票阶段
   */
  const startVoting = useCallback(
    async (proposalId: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.startVoting(proposalId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
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
    async (proposalId: number, optionIndex: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.castVote(proposalId, optionIndex);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
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
   * 开始计票
   */
  const startTallying = useCallback(
    async (proposalId: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.startTallying(proposalId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
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
    async (proposalId: number) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const contract = await getContract();
        const tx = await contract.revealResult(proposalId);
        await tx.wait();
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err) {
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
   * 获取提案信息
   */
  const getProposal = useCallback(
    async (proposalId: number): Promise<Proposal | null> => {
      try {
        const contract = await getReadOnlyContract();
        const proposal = await contract.getProposal(proposalId);

        return {
          id: Number(proposal.id),
          creator: proposal.creator,
          config: {
            title: proposal.config.title,
            description: proposal.config.description,
            options: proposal.config.options,
            votingRule: Number(proposal.config.votingRule),
            privacyLevel: Number(proposal.config.privacyLevel),
            registrationStart: Number(proposal.config.registrationStart),
            registrationEnd: Number(proposal.config.registrationEnd),
            votingStart: Number(proposal.config.votingStart),
            votingEnd: Number(proposal.config.votingEnd),
            quorum: Number(proposal.config.quorum),
          },
          state: Number(proposal.state),
          totalVoters: Number(proposal.totalVoters),
          totalVotes: Number(proposal.totalVotes),
          resultRevealed: proposal.resultRevealed,
        };
      } catch (err) {
        console.error("获取提案失败:", err);
        return null;
      }
    },
    [getReadOnlyContract]
  );

  /**
   * 获取所有提案
   */
  const getAllProposals = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const contract = await getReadOnlyContract();
      const count = await contract.proposalCount();
      const proposals: Proposal[] = [];

      for (let i = 1; i <= Number(count); i++) {
        const proposal = await getProposal(i);
        if (proposal) {
          proposals.push(proposal);
        }
      }

      setState((prev) => ({ ...prev, isLoading: false, proposals }));
      return proposals;
    } catch (err) {
      const error = err as Error;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "获取提案列表失败",
      }));
      return [];
    }
  }, [getReadOnlyContract, getProposal]);

  /**
   * 检查用户是否已注册
   */
  const isVoterRegistered = useCallback(
    async (proposalId: number, voter: string): Promise<boolean> => {
      try {
        const contract = await getReadOnlyContract();
        return await contract.isVoterRegistered(proposalId, voter);
      } catch {
        return false;
      }
    },
    [getReadOnlyContract]
  );

  /**
   * 检查用户是否已投票
   */
  const hasVoted = useCallback(
    async (proposalId: number, voter: string): Promise<boolean> => {
      try {
        const contract = await getReadOnlyContract();
        return await contract.hasVoted(proposalId, voter);
      } catch {
        return false;
      }
    },
    [getReadOnlyContract]
  );

  /**
   * 获取投票结果
   */
  const getVoteCounts = useCallback(
    async (proposalId: number): Promise<number[]> => {
      try {
        const contract = await getReadOnlyContract();
        const counts = await contract.getVoteCounts(proposalId);
        return counts.map((c: bigint) => Number(c));
      } catch {
        return [];
      }
    },
    [getReadOnlyContract]
  );

  // 清除错误
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    createProposal,
    startRegistration,
    registerVoter,
    startVoting,
    castVote,
    startTallying,
    revealResult,
    getProposal,
    getAllProposals,
    isVoterRegistered,
    hasVoted,
    getVoteCounts,
    clearError,
  };
}

/**
 * 状态标签配置
 */
export const stateLabels: Record<VotingState, string> = {
  [VotingState.Created]: "已创建",
  [VotingState.Registration]: "注册中",
  [VotingState.Voting]: "投票中",
  [VotingState.Tallying]: "计票中",
  [VotingState.Finalized]: "已完成",
};

/**
 * 投票规则标签
 */
export const ruleLabels: Record<VotingRule, string> = {
  [VotingRule.SimpleMajority]: "简单多数",
  [VotingRule.Weighted]: "加权投票",
  [VotingRule.Quadratic]: "二次方投票",
  [VotingRule.RankedChoice]: "排序选择",
};

/**
 * 隐私级别标签
 */
export const privacyLabels: Record<PrivacyLevel, string> = {
  [PrivacyLevel.Public]: "公开投票",
  [PrivacyLevel.Anonymous]: "匿名投票",
  [PrivacyLevel.Encrypted]: "加密投票",
  [PrivacyLevel.FullPrivacy]: "完全隐私",
};

