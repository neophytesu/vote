// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IVotingTypes.sol";

/**
 * @title VotingDataTypes
 * @notice 跨合约共享的数据结构（避免复制粘贴导致 ABI 解码错位）
 * @dev 仅承载类型定义，不包含逻辑
 */
library VotingDataTypes {
    /**
     * @notice 核心字段（尽量定长，供模块按需读取）
     */
    struct VotingCoreFields {
        uint256 id;
        address creator;
        IVotingTypes.VotingRule votingRule;
        IVotingTypes.PrivacyLevel privacyLevel;
        IVotingTypes.VotingState state; // 存储状态（有效状态请用 core.getEffectiveState）
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        uint256 createdAt;
        bool autoAdvance;
        uint16 visibilityBitmap;
        IVotingTypes.RegistrationRule registrationRule;
        address tokenContractAddress;
        uint256 tokenMinBalance;
        bool useBlockNumber;
        bool allowExtension;
        uint256 snapshotBlockNumber;
        bool useThresholdDecryption;
        uint8 thresholdT;
        uint256 revealDelay;
        uint256 optionsCount;
        uint256 weightGroupCount;
    }

    /**
     * @notice 投票基本信息结构（包含动态字段）
     * @dev 作为存储结构使用；模块侧优先通过 V2 getter 按需读取
     */
    struct VotingInfo {
        uint256 id;
        address creator;
        string title;
        string description;
        string[] options;
        IVotingTypes.VotingRule votingRule;
        IVotingTypes.PrivacyLevel privacyLevel;
        IVotingTypes.VotingState state;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        uint256 createdAt;
        bool autoAdvance; // 是否自动推进状态
        uint16 visibilityBitmap; // 可见性配置位图 (每项2位: 0=隐藏,1=创建者,2=参与者,3=公开)
        string[] weightGroupNames; // 加权投票：权重分组名称
        uint256[] weightGroupWeights; // 加权投票：权重分组权重值
        IVotingTypes.RegistrationRule registrationRule; // 注册规则
        address tokenContractAddress; // NFT/Token 合约地址
        uint256 tokenMinBalance; // 最低持有数量
        bool useBlockNumber; // 时间控制：true=用区块高度，false=用时间戳
        bool allowExtension; // 是否允许动态延长注册期/投票期
        uint256 snapshotBlockNumber; // 快照区块（0=当前余额；>0 时 token 支持 getPastVotes 则按该区块余额计资格与权重）
        bool useThresholdDecryption; // 是否使用阈值解密
        uint8 thresholdT; // 阈值 t
        address[] thresholdCommittee; // 委员会成员地址列表
        uint256 revealDelay; // 结果揭示延迟（区块或秒，0=不延迟）
    }

    /**
     * @notice 投票详情结构（包含聚合数据）
     */
    struct VotingDetails {
        uint256 id;
        address creator;
        string title;
        string description;
        string[] options;
        IVotingTypes.VotingRule votingRule;
        IVotingTypes.PrivacyLevel privacyLevel;
        IVotingTypes.VotingState state;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        uint256 totalVoters;
        uint256 totalVotes;
        uint256[] voteCounts;
        bool resultRevealed;
        uint256 createdAt;
        bool autoAdvance;
        uint16 visibilityBitmap;
        string[] weightGroupNames;
        uint256[] weightGroupWeights;
        IVotingTypes.RegistrationRule registrationRule;
        address tokenContractAddress;
        uint256 tokenMinBalance;
        bool useBlockNumber;
        bool allowExtension;
        uint256 snapshotBlockNumber;
        bool useThresholdDecryption;
        uint8 thresholdT;
        address[] thresholdCommittee;
        uint256 revealDelay;
    }

    /**
     * @notice 创建投票参数（与 VotingFactory 入口保持一致）
     */
    struct CreateVotingParams {
        string title;
        string description;
        string[] options;
        IVotingTypes.VotingRule votingRule;
        IVotingTypes.PrivacyLevel privacyLevel;
        uint256 registrationStart;
        uint256 registrationEnd;
        uint256 votingStart;
        uint256 votingEnd;
        uint256 quorum;
        bool autoAdvance;
        uint16 visibilityBitmap;
        bool enableWhitelist;
        address[] whitelist;
        uint256[] whitelistGroupIndexes;
        string[] weightGroupNames;
        uint256[] weightGroupWeights;
        IVotingTypes.RegistrationRule registrationRule;
        address tokenContractAddress;
        uint256 tokenMinBalance;
        bool useBlockNumber;
        bool allowExtension;
        uint256 snapshotBlockNumber;
        IVotingTypes.ExecutionMode executionMode;
        address executionTarget;
        uint256 executionValue;
        bytes executionCalldata;
        uint256 executionOnWinningOption;
        address executionMultisig;
        uint256 executionTimelockDelay;
        bool useThresholdDecryption;
        address[] thresholdCommittee;
        uint8 thresholdT;
        uint256 revealDelay;
    }
}

