import { useState, useCallback, useEffect } from "react";
import { BrowserProvider, Contract } from "ethers";
import { getContractAddresses } from "@/contracts/abi";

/**
 * 统计中心合约 ABI
 */
const StatisticsCenterABI = [
  // 全局统计
  "function getGlobalStats() view returns (tuple(uint256 totalVotings, uint256 totalVoters, uint256 totalVotesCast, uint256 totalCreators, uint256 totalParticipants, uint256 completedVotings, uint256 activeVotings))",
  
  // 用户统计
  "function getUserStats(address user) view returns (tuple(uint256 votingsCreated, uint256 votingsParticipated, uint256 votesCast, uint256 firstActivityTime, uint256 lastActivityTime, bool isCreator, bool isParticipant))",
  
  // 投票统计
  "function getVotingStats(uint256 votingId) view returns (tuple(uint256 registrationCount, uint256 voteCount, uint256 participationRate, uint256 createdAt, uint256 completedAt, uint8 rule, uint8 privacy, bool isAutoAdvance))",
  
  // 规则和隐私统计
  "function getRuleStats() view returns (uint256 simpleMajority, uint256 weighted, uint256 quadratic, uint256 rankedChoice)",
  "function getPrivacyStats() view returns (uint256 publicCount, uint256 anonymousCount, uint256 encryptedCount, uint256 fullPrivacyCount)",
  "function getAdvanceModeStats() view returns (uint256 autoAdvance, uint256 manualAdvance)",
  
  // 排行榜
  "function getTopCreators() view returns (address[])",
  "function getTopParticipants() view returns (address[])",
  
  // 时间统计
  "function getDailyStats(uint256 dayTimestamp) view returns (uint256 votingsCreated, uint256 votesCast)",
  "function getRecentDailyStats(uint256 days_) view returns (uint256[] votingsCreated, uint256[] votesCast)",
  
  // 计数
  "function getCreatorCount() view returns (uint256)",
  "function getParticipantCount() view returns (uint256)",
] as const;

/**
 * 全局统计数据接口
 */
export interface GlobalStats {
  totalVotings: number;
  totalVoters: number;
  totalVotesCast: number;
  totalCreators: number;
  totalParticipants: number;
  completedVotings: number;
  activeVotings: number;
}

/**
 * 用户统计数据接口
 */
export interface UserStats {
  votingsCreated: number;
  votingsParticipated: number;
  votesCast: number;
  firstActivityTime: number;
  lastActivityTime: number;
  isCreator: boolean;
  isParticipant: boolean;
}

/**
 * 隐私统计数据接口
 */
export interface PrivacyStats {
  publicCount: number;
  anonymousCount: number;
  encryptedCount: number;
  fullPrivacyCount: number;
}

/**
 * 规则统计数据接口
 */
export interface RuleStats {
  simpleMajority: number;
  weighted: number;
  quadratic: number;
  rankedChoice: number;
}

/**
 * 推进模式统计接口
 */
export interface AdvanceModeStats {
  autoAdvance: number;
  manualAdvance: number;
}

/**
 * 使用统计中心合约的 Hook
 */
export function useStatisticsCenter(chainId: number | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [privacyStats, setPrivacyStats] = useState<PrivacyStats | null>(null);
  const [ruleStats, setRuleStats] = useState<RuleStats | null>(null);
  const [advanceModeStats, setAdvanceModeStats] = useState<AdvanceModeStats | null>(null);

  // 检查合约是否已部署
  const isContractDeployed = useCallback(() => {
    if (!chainId) return false;
    const addresses = getContractAddresses(chainId);
    return addresses.statisticsCenter && 
           addresses.statisticsCenter !== "0x0000000000000000000000000000000000000000";
  }, [chainId]);

  // 获取只读合约实例
  const getContract = useCallback(async () => {
    if (!window.ethereum || !chainId) {
      throw new Error("请先连接钱包");
    }

    const addresses = getContractAddresses(chainId);
    if (!addresses.statisticsCenter || 
        addresses.statisticsCenter === "0x0000000000000000000000000000000000000000") {
      throw new Error("统计中心合约尚未部署");
    }

    const provider = new BrowserProvider(window.ethereum);
    return new Contract(addresses.statisticsCenter, StatisticsCenterABI, provider);
  }, [chainId]);

  // 获取全局统计
  const fetchGlobalStats = useCallback(async (): Promise<GlobalStats | null> => {
    if (!isContractDeployed()) return null;
    
    try {
      const contract = await getContract();
      const stats = await contract.getGlobalStats();
      
      const result: GlobalStats = {
        totalVotings: Number(stats.totalVotings),
        totalVoters: Number(stats.totalVoters),
        totalVotesCast: Number(stats.totalVotesCast),
        totalCreators: Number(stats.totalCreators),
        totalParticipants: Number(stats.totalParticipants),
        completedVotings: Number(stats.completedVotings),
        activeVotings: Number(stats.activeVotings),
      };
      
      setGlobalStats(result);
      return result;
    } catch (err) {
      console.error("获取全局统计失败:", err);
      return null;
    }
  }, [getContract, isContractDeployed]);

  // 获取隐私统计
  const fetchPrivacyStats = useCallback(async (): Promise<PrivacyStats | null> => {
    if (!isContractDeployed()) return null;
    
    try {
      const contract = await getContract();
      const [publicCount, anonymousCount, encryptedCount, fullPrivacyCount] = 
        await contract.getPrivacyStats();
      
      const result: PrivacyStats = {
        publicCount: Number(publicCount),
        anonymousCount: Number(anonymousCount),
        encryptedCount: Number(encryptedCount),
        fullPrivacyCount: Number(fullPrivacyCount),
      };
      
      setPrivacyStats(result);
      return result;
    } catch (err) {
      console.error("获取隐私统计失败:", err);
      return null;
    }
  }, [getContract, isContractDeployed]);

  // 获取规则统计
  const fetchRuleStats = useCallback(async (): Promise<RuleStats | null> => {
    if (!isContractDeployed()) return null;
    
    try {
      const contract = await getContract();
      const [simpleMajority, weighted, quadratic, rankedChoice] = 
        await contract.getRuleStats();
      
      const result: RuleStats = {
        simpleMajority: Number(simpleMajority),
        weighted: Number(weighted),
        quadratic: Number(quadratic),
        rankedChoice: Number(rankedChoice),
      };
      
      setRuleStats(result);
      return result;
    } catch (err) {
      console.error("获取规则统计失败:", err);
      return null;
    }
  }, [getContract, isContractDeployed]);

  // 获取推进模式统计
  const fetchAdvanceModeStats = useCallback(async (): Promise<AdvanceModeStats | null> => {
    if (!isContractDeployed()) return null;
    
    try {
      const contract = await getContract();
      const [autoAdvance, manualAdvance] = await contract.getAdvanceModeStats();
      
      const result: AdvanceModeStats = {
        autoAdvance: Number(autoAdvance),
        manualAdvance: Number(manualAdvance),
      };
      
      setAdvanceModeStats(result);
      return result;
    } catch (err) {
      console.error("获取推进模式统计失败:", err);
      return null;
    }
  }, [getContract, isContractDeployed]);

  // 获取用户统计
  const fetchUserStats = useCallback(async (userAddress: string): Promise<UserStats | null> => {
    if (!isContractDeployed()) return null;
    
    try {
      const contract = await getContract();
      const stats = await contract.getUserStats(userAddress);
      
      return {
        votingsCreated: Number(stats.votingsCreated),
        votingsParticipated: Number(stats.votingsParticipated),
        votesCast: Number(stats.votesCast),
        firstActivityTime: Number(stats.firstActivityTime),
        lastActivityTime: Number(stats.lastActivityTime),
        isCreator: stats.isCreator,
        isParticipant: stats.isParticipant,
      };
    } catch (err) {
      console.error("获取用户统计失败:", err);
      return null;
    }
  }, [getContract, isContractDeployed]);

  // 获取排行榜
  const fetchTopCreators = useCallback(async (): Promise<string[]> => {
    if (!isContractDeployed()) return [];
    
    try {
      const contract = await getContract();
      return await contract.getTopCreators();
    } catch (err) {
      console.error("获取创建者排行榜失败:", err);
      return [];
    }
  }, [getContract, isContractDeployed]);

  const fetchTopParticipants = useCallback(async (): Promise<string[]> => {
    if (!isContractDeployed()) return [];
    
    try {
      const contract = await getContract();
      return await contract.getTopParticipants();
    } catch (err) {
      console.error("获取参与者排行榜失败:", err);
      return [];
    }
  }, [getContract, isContractDeployed]);

  // 刷新所有统计
  const refreshAllStats = useCallback(async () => {
    if (!isContractDeployed()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        fetchGlobalStats(),
        fetchPrivacyStats(),
        fetchRuleStats(),
        fetchAdvanceModeStats(),
      ]);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchGlobalStats, fetchPrivacyStats, fetchRuleStats, fetchAdvanceModeStats, isContractDeployed]);

  // 自动加载统计数据
  useEffect(() => {
    if (chainId && isContractDeployed()) {
      refreshAllStats();
    }
  }, [chainId, isContractDeployed, refreshAllStats]);

  return {
    isLoading,
    error,
    globalStats,
    privacyStats,
    ruleStats,
    advanceModeStats,
    isContractDeployed,
    fetchGlobalStats,
    fetchPrivacyStats,
    fetchRuleStats,
    fetchAdvanceModeStats,
    fetchUserStats,
    fetchTopCreators,
    fetchTopParticipants,
    refreshAllStats,
  };
}
