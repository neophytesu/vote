import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * 投票系统完整部署模块
 * 
 * 部署顺序:
 * 1. RegistrationCenter - 注册中心
 * 2. VotingCenter - 计票中心
 * 3. RevealCenter - 揭示中心
 * 4. VotingFactory - 工厂合约（整合上述三个中心）
 * 5. 设置各中心的授权合约地址
 */
const VotingFactoryModule = buildModule("VotingFactoryModule", (m) => {
  // 1. 部署注册中心
  const registrationCenter = m.contract("RegistrationCenter", []);

  // 2. 部署计票中心
  const votingCenter = m.contract("VotingCenter", []);

  // 3. 部署揭示中心
  const revealCenter = m.contract("RevealCenter", []);

  // 4. 部署工厂合约，传入三个中心的地址
  const votingFactory = m.contract("VotingFactory", [
    registrationCenter,
    votingCenter,
    revealCenter,
  ]);

  // 5. 设置各中心的授权合约为 VotingFactory
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

  return {
    registrationCenter,
    votingCenter,
    revealCenter,
    votingFactory,
  };
});

export default VotingFactoryModule;
