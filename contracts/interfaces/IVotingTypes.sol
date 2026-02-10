// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IVotingTypes
 * @notice 投票系统的类型定义
 */
interface IVotingTypes {
    /// @notice 投票状态枚举 - 对应文档中的5个阶段
    enum VotingState {
        Created,        // Step 1: 选票已创建
        Registration,   // Step 2: 选民注册中
        Voting,         // Step 3: 投票进行中
        Tallying,       // Step 4: 计票中
        Finalized       // Step 5: 已完成
    }

    /// @notice 投票规则类型
    enum VotingRule {
        SimpleMajority,  // 简单多数
        Weighted,        // 加权投票
        Quadratic,       // 二次方投票
        RankedChoice     // 排序选择
    }

    /// @notice 隐私级别
    enum PrivacyLevel {
        Public,         // 公开投票
        Anonymous,      // 匿名投票 (Semaphore)
        Encrypted,      // 加密投票 (同态加密)
        FullPrivacy     // 完全隐私 (Semaphore + 同态加密)
    }

    /// @notice 注册规则
    enum RegistrationRule {
        Open,           // 开放注册 - 任何人可注册
        Approval,       // 创建者审核 - 需创建者批准
        NFTHolder,      // NFT 持有者 - 持有指定 NFT（预留）
        TokenHolder     // Token 持有者 - 持有指定 Token（预留）
    }

    /// @notice 提案配置
    struct ProposalConfig {
        string title;              // 提案标题
        string description;        // 提案描述
        string[] options;          // 投票选项
        VotingRule votingRule;     // 投票规则
        PrivacyLevel privacyLevel; // 隐私级别
        uint256 registrationStart; // 注册开始时间
        uint256 registrationEnd;   // 注册结束时间
        uint256 votingStart;       // 投票开始时间
        uint256 votingEnd;         // 投票结束时间
        uint256 quorum;            // 法定人数
    }

    /// @notice 提案信息
    struct Proposal {
        uint256 id;
        address creator;
        ProposalConfig config;
        VotingState state;
        uint256 totalVoters;       // 注册选民数
        uint256 totalVotes;        // 已投票数
        bool resultRevealed;       // 结果是否已揭示
    }
}

