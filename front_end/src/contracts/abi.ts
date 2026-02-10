/**
 * 投票系统合约 ABI
 * 
 * ⚠️ 此文件由部署脚本自动生成，请勿手动修改地址部分
 * 最后更新: 2026-02-10T14:52:15.688Z
 */

export const VotingCoreABI = [
  // 事件
  "event ProposalCreated(uint256 indexed proposalId, address indexed creator, string title)",
  "event StateChanged(uint256 indexed proposalId, uint8 oldState, uint8 newState)",
  "event VoterRegistered(uint256 indexed proposalId, address indexed voter)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 optionIndex)",
  "event ResultFinalized(uint256 indexed proposalId, uint256 winningOption, bool passed)",
  
  // 状态查询
  "function proposalCount() view returns (uint256)",
  "function getProposal(uint256 proposalId) view returns (tuple(uint256 id, address creator, tuple(string title, string description, string[] options, uint8 votingRule, uint8 privacyLevel, uint256 registrationStart, uint256 registrationEnd, uint256 votingStart, uint256 votingEnd, uint256 quorum) config, uint8 state, uint256 totalVoters, uint256 totalVotes, bool resultRevealed))",
  "function getProposalOptions(uint256 proposalId) view returns (string[])",
  "function getProposalState(uint256 proposalId) view returns (uint8)",
  "function isVoterRegistered(uint256 proposalId, address voter) view returns (bool)",
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function getVoteCounts(uint256 proposalId) view returns (uint256[])",
  
  // 提案操作
  "function createProposal(tuple(string title, string description, string[] options, uint8 votingRule, uint8 privacyLevel, uint256 registrationStart, uint256 registrationEnd, uint256 votingStart, uint256 votingEnd, uint256 quorum) config) returns (uint256)",
  "function startRegistration(uint256 proposalId)",
  "function registerVoter(uint256 proposalId)",
  "function startVoting(uint256 proposalId)",
  "function castVote(uint256 proposalId, uint256 optionIndex)",
  "function startTallying(uint256 proposalId)",
  "function revealResult(uint256 proposalId)",
] as const;

export const RegistrationCenterABI = [
  "function isRegistered(uint256 proposalId, address voter) view returns (bool)",
  "function voterCount(uint256 proposalId) view returns (uint256)",
  "function getRegisteredVoters(uint256 proposalId) view returns (address[])",
  "function getVoterWeight(uint256 proposalId, address voter) view returns (uint256)",
  "function getVoterGroupIndex(uint256 proposalId, address voter) view returns (uint256)",
  "function isPending(uint256 proposalId, address voter) view returns (bool)",
  "function pendingCount(uint256 proposalId) view returns (uint256)",
  "function getPendingVoters(uint256 proposalId) view returns (address[])",
  "function isPendingVoter(uint256 proposalId, address voter) view returns (bool)",
] as const;

export const VotingCenterABI = [
  "function hasVoted(uint256 proposalId, address voter) view returns (bool)",
  "function getVoteCount(uint256 proposalId, uint256 optionIndex) view returns (uint256)",
  "function getAllVoteCounts(uint256 proposalId) view returns (uint256[])",
  "function getTotalVotes(uint256 proposalId) view returns (uint256)",
] as const;

export const RevealCenterABI = [
  "function isResultRevealed(uint256 proposalId) view returns (bool)",
  "function getResult(uint256 proposalId) view returns (tuple(uint256[] voteCounts, uint256 totalVotes, uint256 totalVoters, uint256 winningOption, uint256 winningVotes, bool isRevealed, bool passed, uint256 revealedAt))",
  "function getWinningOption(uint256 proposalId) view returns (uint256 optionIndex, uint256 votes)",
  "function getParticipationRate(uint256 proposalId) view returns (uint256)",
] as const;

/**
 * 统计中心合约 ABI
 */
export const StatisticsCenterABI = [
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
 * 投票工厂合约 ABI
 */
export const VotingFactoryABI = [
  // 事件
  "event VotingCreated(uint256 indexed votingId, address indexed creator, string title, uint256 timestamp)",
  "event VoterRegistered(uint256 indexed votingId, address indexed voter)",
  "event VoteCast(uint256 indexed votingId, address indexed voter, uint256 optionIndex)",
  "event StateChanged(uint256 indexed votingId, uint8 newState)",
  "event ResultRevealed(uint256 indexed votingId, uint256 winningOption)",
  "event RegistrationRequested(uint256 indexed votingId, address indexed voter)",
  "event RegistrationApproved(uint256 indexed votingId, address indexed voter)",
  "event RegistrationRejected(uint256 indexed votingId, address indexed voter)",
  
  // 写入函数
  "function createVoting(tuple(string title, string description, string[] options, uint8 votingRule, uint8 privacyLevel, uint256 registrationStart, uint256 registrationEnd, uint256 votingStart, uint256 votingEnd, uint256 quorum, bool autoAdvance, uint16 visibilityBitmap, bool enableWhitelist, address[] whitelist, uint256[] whitelistGroupIndexes, string[] weightGroupNames, uint256[] weightGroupWeights, uint8 registrationRule, address tokenContractAddress, uint256 tokenMinBalance) params) returns (uint256)",
  "function startRegistration(uint256 votingId)",
  "function registerVoter(uint256 votingId)",
  "function registerVoterWeighted(uint256 votingId, uint256 groupIndex)",
  "function approveRegistration(uint256 votingId, address voter)",
  "function batchApproveRegistrations(uint256 votingId, address[] voters)",
  "function rejectRegistration(uint256 votingId, address voter)",
  "function startVoting(uint256 votingId)",
  "function castVote(uint256 votingId, uint256 optionIndex)",
  "function castQuadraticVote(uint256 votingId, uint256[] optionIndexes, uint256[] voteAmounts)",
  "function castRankedVote(uint256 votingId, uint256[] rankedOptions)",
  "function startTallying(uint256 votingId)",
  "function revealResult(uint256 votingId)",
  
  // 查询函数
  "function votingCount() view returns (uint256)",
  "function getVoting(uint256 votingId) view returns (tuple(uint256 id, address creator, string title, string description, string[] options, uint8 votingRule, uint8 privacyLevel, uint8 state, uint256 registrationStart, uint256 registrationEnd, uint256 votingStart, uint256 votingEnd, uint256 quorum, uint256 totalVoters, uint256 totalVotes, uint256[] voteCounts, bool resultRevealed, uint256 createdAt, bool autoAdvance, uint16 visibilityBitmap, string[] weightGroupNames, uint256[] weightGroupWeights, uint8 registrationRule, address tokenContractAddress, uint256 tokenMinBalance))",
  "function getAllVotingIds() view returns (uint256[])",
  "function getRecentVotings(uint256 count) view returns (tuple(uint256 id, address creator, string title, string description, string[] options, uint8 votingRule, uint8 privacyLevel, uint8 state, uint256 registrationStart, uint256 registrationEnd, uint256 votingStart, uint256 votingEnd, uint256 quorum, uint256 totalVoters, uint256 totalVotes, uint256[] voteCounts, bool resultRevealed, uint256 createdAt, bool autoAdvance, uint16 visibilityBitmap, string[] weightGroupNames, uint256[] weightGroupWeights, uint8 registrationRule, address tokenContractAddress, uint256 tokenMinBalance)[])",
  "function getVotingsByCreator(address creator) view returns (uint256[])",
  "function getVotingsByVoter(address voter) view returns (uint256[])",
  "function getVotingOptions(uint256 votingId) view returns (string[])",
  "function getVotingResult(uint256 votingId) view returns (uint256[] voteCounts, uint256 winningOption, uint256 totalVotes)",
  "function getUserVotingStatus(uint256 votingId, address user) view returns (bool registered, bool voted)",
  "function getUserFullStatus(uint256 votingId, address user) view returns (bool registered, bool pending, bool voted)",
  "function getVotingState(uint256 votingId) view returns (uint8)",
  "function getVotingsBatch(uint256[] votingIds) view returns (tuple(uint256 id, address creator, string title, string description, string[] options, uint8 votingRule, uint8 privacyLevel, uint8 state, uint256 registrationStart, uint256 registrationEnd, uint256 votingStart, uint256 votingEnd, uint256 quorum, uint256 totalVoters, uint256 totalVotes, uint256[] voteCounts, bool resultRevealed, uint256 createdAt, bool autoAdvance, uint16 visibilityBitmap, string[] weightGroupNames, uint256[] weightGroupWeights, uint8 registrationRule, address tokenContractAddress, uint256 tokenMinBalance)[])",
  "function isRegistered(uint256 votingId, address voter) view returns (bool)",
  "function isPendingVoter(uint256 votingId, address voter) view returns (bool)",
  "function hasVoted(uint256 votingId, address voter) view returns (bool)",
  "function getPendingVoters(uint256 votingId) view returns (address[])",
  "function getPendingCount(uint256 votingId) view returns (uint256)",
  "function getVoteRecords(uint256 votingId) view returns (address[] voters, uint256[] optionIndexes, uint256[] timestamps)",
  "function getRankedVoteRecords(uint256 votingId) view returns (address[] voters, uint256[][] rankings, uint256[] timestamps)",
  "function getVoterChoice(uint256 votingId, address voter) view returns (uint256 optionIndex, uint256 timestamp, bool voted)",
] as const;

/**
 * 投票状态
 */
export const VotingState = {
  Created: 0,
  Registration: 1,
  Voting: 2,
  Tallying: 3,
  Finalized: 4,
} as const;
export type VotingState = (typeof VotingState)[keyof typeof VotingState];

/**
 * 投票规则
 */
export const VotingRule = {
  SimpleMajority: 0,
  Weighted: 1,
  Quadratic: 2,
  RankedChoice: 3,
} as const;
export type VotingRule = (typeof VotingRule)[keyof typeof VotingRule];

/**
 * 隐私级别
 */
export const PrivacyLevel = {
  Public: 0,
  Anonymous: 1,
  Encrypted: 2,
  FullPrivacy: 3,
} as const;
export type PrivacyLevel = (typeof PrivacyLevel)[keyof typeof PrivacyLevel];

/**
 * 注册规则
 */
export const RegistrationRule = {
  Open: 0,
  Approval: 1,
  NFTHolder: 2,
  TokenHolder: 3,
} as const;
export type RegistrationRule = (typeof RegistrationRule)[keyof typeof RegistrationRule];

/**
 * 合约地址配置
 * ⚠️ 地址由部署脚本自动更新
 */
export const CONTRACT_ADDRESSES = {
  // Sepolia 测试网地址 (部署后更新)
  sepolia: {
    votingFactory: "0x0000000000000000000000000000000000000000",
    registrationCenter: "0x0000000000000000000000000000000000000000",
    votingCenter: "0x0000000000000000000000000000000000000000",
    revealCenter: "0x0000000000000000000000000000000000000000",
    statisticsCenter: "0x0000000000000000000000000000000000000000",
  },
  // 本地开发网络 - 自动更新
  localhost: {
    votingFactory: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    registrationCenter: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    votingCenter: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    revealCenter: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    statisticsCenter: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  },
} as const;

/**
 * 获取当前网络的合约地址
 */
export function getContractAddresses(chainId: number) {
  switch (chainId) {
    case 11155111: // Sepolia
      return CONTRACT_ADDRESSES.sepolia;
    case 31337: // Hardhat local
    case 1337: // Local dev
      return CONTRACT_ADDRESSES.localhost;
    default:
      return CONTRACT_ADDRESSES.localhost;
  }
}
