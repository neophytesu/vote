/**
 * 完整部署脚本 - 使用 Viem 替代 Ignition
 * 用法: npx hardhat run scripts/deploy-full.ts --network localhost
 * 或:  npm run deploy:hardhat  (使用 hardhatMainnet，适用于无 localhost 节点时验证部署)
 */
import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// localhost 节点部署大合约时 gas 估算可能失败，使用显式 gas 绕过
const GAS_LIMIT = 30_000_000n;

async function resetLocalhostNode() {
  const rpcUrl = process.env.HARDHAT_NETWORK === "localhost" ? "http://127.0.0.1:8545" : null;
  if (!rpcUrl) return;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "hardhat_reset",
        params: [{ allowUnlimitedContractSize: true, blockGasLimit: "0x1C9C380" }],
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    console.log("已对 localhost 节点执行 hardhat_reset (allowUnlimitedContractSize)");
  } catch (e) {
    console.warn("hardhat_reset 失败，继续部署:", (e as Error).message);
  }
}

async function main() {
  if (process.env.HARDHAT_NETWORK === "localhost") {
    await resetLocalhostNode();
  }

  const { viem } = await network.connect();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No wallet client");
  const publicClient = await viem.getPublicClient();

  console.log("Deploying with account:", deployer.account.address);

  const gasOverrides = { gas: GAS_LIMIT };

  // 1. PoseidonT3
  const poseidonT3 = await viem.deployContract("PoseidonT3", [], gasOverrides);
  console.log("PoseidonT3:", poseidonT3.address);

  // 2. SemaphoreVerifier
  const semaphoreVerifier = await viem.deployContract("SemaphoreVerifier", [], gasOverrides);
  console.log("SemaphoreVerifier:", semaphoreVerifier.address);

  // 3. Semaphore (with library)
  const semaphore = await viem.deployContract(
    "Semaphore",
    [semaphoreVerifier.address],
    {
      libraries: {
        "npm/poseidon-solidity@0.0.5/PoseidonT3.sol:PoseidonT3": poseidonT3.address as `0x${string}`,
      },
      ...gasOverrides,
    }
  );
  console.log("Semaphore:", semaphore.address);

  // 4. Centers
  const registrationCenter = await viem.deployContract("RegistrationCenter");
  console.log("RegistrationCenter:", registrationCenter.address);

  const votingCenter = await viem.deployContract("VotingCenter");
  console.log("VotingCenter:", votingCenter.address);

  const revealCenter = await viem.deployContract("RevealCenter");
  console.log("RevealCenter:", revealCenter.address);

  const statisticsCenter = await viem.deployContract("StatisticsCenter");
  console.log("StatisticsCenter:", statisticsCenter.address);

  // 5. VotingFactory
  const votingFactory = await viem.deployContract("VotingFactory", [
    registrationCenter.address,
    votingCenter.address,
    revealCenter.address,
    statisticsCenter.address,
  ]);
  console.log("VotingFactory:", votingFactory.address);

  // 6. AnonymousVoting
  const anonymousVoting = await viem.deployContract(
    "AnonymousVoting",
    [
      votingFactory.address,
      semaphore.address,
      registrationCenter.address,
      votingCenter.address,
      statisticsCenter.address,
    ],
    gasOverrides
  );
  console.log("AnonymousVoting:", anonymousVoting.address);

  // 7. QueryCenter
  const queryCenter = await viem.deployContract("QueryCenter", [votingFactory.address]);
  console.log("QueryCenter:", queryCenter.address);

  // 8. 配置（必须先设置 votingCore，VotingFactory.setAnonymousVoting 会传播到各中心）
  await registrationCenter.write.setVotingCore([votingFactory.address]);
  await votingCenter.write.setVotingCore([votingFactory.address]);
  await votingCenter.write.setRegistrationCenter([registrationCenter.address]);
  const txSetAnonymous = await votingFactory.write.setAnonymousVoting([anonymousVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: txSetAnonymous });

  const txRevealCore = await revealCenter.write.setVotingCore([votingFactory.address]);
  await publicClient.waitForTransactionReceipt({ hash: txRevealCore });

  const txStatsAuth = await statisticsCenter.write.setAuthorizedCaller([votingFactory.address]);
  await publicClient.waitForTransactionReceipt({ hash: txStatsAuth });

  const txStatsAnonymous = await statisticsCenter.write.setAnonymousVoting([anonymousVoting.address]);
  await publicClient.waitForTransactionReceipt({ hash: txStatsAnonymous });

  console.log("\n✅ 部署完成!");

  const addresses = {
    "VotingFactoryModule#VotingFactory": votingFactory.address,
    "VotingFactoryModule#AnonymousVoting": anonymousVoting.address,
    "VotingFactoryModule#RegistrationCenter": registrationCenter.address,
    "VotingFactoryModule#VotingCenter": votingCenter.address,
    "VotingFactoryModule#RevealCenter": revealCenter.address,
    "VotingFactoryModule#StatisticsCenter": statisticsCenter.address,
    "VotingFactoryModule#QueryCenter": queryCenter.address,
  };

  const deploymentDir = path.join(__dirname, "../ignition/deployments/chain-31337");
  if (!fs.existsSync(deploymentDir)) {
    fs.mkdirSync(deploymentDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(deploymentDir, "deployed_addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("\n地址已写入 ignition/deployments/chain-31337/deployed_addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
