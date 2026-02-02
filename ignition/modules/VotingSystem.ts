import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * 投票系统部署模块
 * 
 * 部署顺序:
 * 1. RegistrationCenter - 注册中心
 * 2. VotingCenter - 计票中心
 * 3. RevealCenter - 揭示中心
 * 4. VotingCore - 主合约
 * 5. 设置各中心的主合约地址
 */
const VotingSystemModule = buildModule("VotingSystem", (m) => {
  // 1. 部署注册中心
  const registrationCenter = m.contract("RegistrationCenter", []);

  // 2. 部署计票中心
  const votingCenter = m.contract("VotingCenter", []);

  // 3. 部署揭示中心
  const revealCenter = m.contract("RevealCenter", []);

  // 4. 部署主合约，传入三个中心的地址
  const votingCore = m.contract("VotingCore", [
    registrationCenter,
    votingCenter,
    revealCenter,
  ]);

  // 5. 设置各中心的主合约地址
  m.call(registrationCenter, "setVotingCore", [votingCore], {
    id: "setVotingCore_registration",
  });

  m.call(votingCenter, "setVotingCore", [votingCore], {
    id: "setVotingCore_voting",
  });

  m.call(votingCenter, "setRegistrationCenter", [registrationCenter], {
    id: "setRegistrationCenter",
  });

  m.call(revealCenter, "setVotingCore", [votingCore], {
    id: "setVotingCore_reveal",
  });

  return {
    registrationCenter,
    votingCenter,
    revealCenter,
    votingCore,
  };
});

export default VotingSystemModule;

