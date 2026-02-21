import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * 投票系统完整部署模块
 * 
 * 部署顺序:
 * 1. SemaphoreVerifier - ZK 证明验证
 * 2. Semaphore - 匿名群组与证明
 * 3. RegistrationCenter - 注册中心
 * 4. VotingCenter - 计票中心
 * 5. RevealCenter - 揭示中心
 * 6. StatisticsCenter - 统计中心
 * 7. VotingFactory - 工厂合约（整合上述中心）
 * 8. QueryCenter - 查询中心
 * 9. 设置各中心的授权合约地址，设置 Semaphore
 */
const VotingFactoryModule = buildModule("VotingFactoryModule", (m) => {
  // 1. 部署 PoseidonT3 库（Semaphore 依赖）
  const poseidonT3 = m.library("PoseidonT3", { id: "PoseidonT3" });

  // 2. 部署 Semaphore（匿名投票）
  const semaphoreVerifier = m.contract("SemaphoreVerifier", [], {
    id: "SemaphoreVerifier",
  });
  const semaphore = m.contract("Semaphore", [semaphoreVerifier], {
    id: "Semaphore",
    libraries: {
      "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3": poseidonT3,
    },
  });

  // 2. 先部署工厂合约（core），再部署中心（构造函数注入 votingCore，避免被抢先 setVotingCore）
  const votingFactory = m.contract("VotingFactory", []);

  // 3. 部署注册中心（注入 votingFactory）
  const registrationCenter = m.contract("RegistrationCenter", [votingFactory]);

  // 4. 部署计票中心（注入 votingFactory + registrationCenter）
  const votingCenter = m.contract("VotingCenter", [votingFactory, registrationCenter]);

  // 5. 部署揭示中心（注入 votingFactory）
  const revealCenter = m.contract("RevealCenter", [votingFactory]);

  // 6. 部署统计中心（authorizedCaller = votingFactory）
  const statisticsCenter = m.contract("StatisticsCenter", [votingFactory]);

  // 6b. 部署执行中心（注入 votingFactory + revealCenter）
  const executionCenter = m.contract("ExecutionCenter", [votingFactory, revealCenter]);

  // 7. 在 core 中配置各中心地址（只需一次）
  m.call(votingFactory, "setCenters", [
    registrationCenter,
    votingCenter,
    revealCenter,
    statisticsCenter,
  ], {
    id: "setCenters",
  });

  // 6b. 部署匿名投票合约
  const anonymousVoting = m.contract("AnonymousVoting", [
    votingFactory,
    semaphore,
    registrationCenter,
    votingCenter,
    statisticsCenter,
  ]);

  // 6c. 部署加密投票合约（同态加密选票提交与计票结果写入）
  const encryptedVoting = m.contract("EncryptedVoting", [
    votingFactory,
    registrationCenter,
    votingCenter,
    statisticsCenter,
  ]);

  // 8. 部署查询中心，传入工厂合约地址
  const queryCenter = m.contract("QueryCenter", [votingFactory]);

  // 9. 设置 AnonymousVoting 到 VotingFactory
  m.call(votingFactory, "setAnonymousVoting", [anonymousVoting], {
    id: "setAnonymousVoting",
  });

  m.call(votingFactory, "setEncryptedVoting", [encryptedVoting], {
    id: "setEncryptedVoting",
  });

  m.call(statisticsCenter, "setAnonymousVoting", [anonymousVoting], {
    id: "setAnonymousVoting_statistics",
  });

  m.call(statisticsCenter, "setEncryptedVoting", [encryptedVoting], {
    id: "setEncryptedVoting_statistics",
  });

  // 10. 设置执行中心（ExecutionCenter 构造函数已注入依赖；core 仅保存地址）
  m.call(votingFactory, "setExecutionCenter", [executionCenter], {
    id: "setExecutionCenter",
  });

  return {
    semaphoreVerifier,
    semaphore,
    registrationCenter,
    votingCenter,
    revealCenter,
    statisticsCenter,
    executionCenter,
    votingFactory,
    anonymousVoting,
    encryptedVoting,
    queryCenter,
  };
});

export default VotingFactoryModule;
