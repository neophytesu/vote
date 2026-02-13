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

  // 2. 部署注册中心
  const registrationCenter = m.contract("RegistrationCenter", []);

  // 3. 部署计票中心
  const votingCenter = m.contract("VotingCenter", []);

  // 4. 部署揭示中心
  const revealCenter = m.contract("RevealCenter", []);

  // 5. 部署统计中心
  const statisticsCenter = m.contract("StatisticsCenter", []);

  // 6. 部署工厂合约，传入四个中心的地址
  const votingFactory = m.contract("VotingFactory", [
    registrationCenter,
    votingCenter,
    revealCenter,
    statisticsCenter,
  ]);

  // 7. 部署查询中心，传入工厂合约地址
  const queryCenter = m.contract("QueryCenter", [votingFactory]);

  // 8. 设置 Semaphore 到 VotingFactory
  m.call(votingFactory, "setSemaphore", [semaphore], {
    id: "setSemaphore",
  });

  // 9. 设置各中心的授权合约为 VotingFactory
  m.call(registrationCenter, "setVotingCore", [votingFactory], {
    id: "setVotingCore_registration",
  });

  m.call(votingCenter, "setVotingCore", [votingFactory], {
    id: "setVotingCore_voting",
  });

  m.call(votingCenter, "setRegistrationCenter", [registrationCenter], {
    id: "setRegistrationCenter",
  });

  m.call(revealCenter, "setVotingCore", [votingFactory], {
    id: "setVotingCore_reveal",
  });

  // 设置统计中心的授权调用者
  m.call(statisticsCenter, "setAuthorizedCaller", [votingFactory], {
    id: "setAuthorizedCaller_statistics",
  });

  return {
    semaphoreVerifier,
    semaphore,
    registrationCenter,
    votingCenter,
    revealCenter,
    statisticsCenter,
    votingFactory,
    queryCenter,
  };
});

export default VotingFactoryModule;
