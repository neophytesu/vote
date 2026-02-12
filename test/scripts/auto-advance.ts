import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = "http://127.0.0.1:8545";
// Hardhat 默认第一个测试账户
const TEST_ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}`
);

const VotingFactoryABI = [
  {
    type: "function",
    name: "createVoting",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "options", type: "string[]" },
          { name: "votingRule", type: "uint8" },
          { name: "privacyLevel", type: "uint8" },
          { name: "registrationStart", type: "uint256" },
          { name: "registrationEnd", type: "uint256" },
          { name: "votingStart", type: "uint256" },
          { name: "votingEnd", type: "uint256" },
          { name: "quorum", type: "uint256" },
          { name: "autoAdvance", type: "bool" },
          { name: "visibilityBitmap", type: "uint16" },
          { name: "enableWhitelist", type: "bool" },
          { name: "whitelist", type: "address[]" },
          { name: "whitelistGroupIndexes", type: "uint256[]" },
          { name: "weightGroupNames", type: "string[]" },
          { name: "weightGroupWeights", type: "uint256[]" },
          { name: "registrationRule", type: "uint8" },
          { name: "tokenContractAddress", type: "address" },
          { name: "tokenMinBalance", type: "uint256" },
          { name: "useBlockNumber", type: "bool" },
          { name: "allowExtension", type: "bool" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "startRegistration", inputs: [{ name: "votingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "registerVoter", inputs: [{ name: "votingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "startVoting", inputs: [{ name: "votingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "castVote", inputs: [{ name: "votingId", type: "uint256" }, { name: "optionIndex", type: "uint256" }], outputs: [] },
  { type: "function", name: "startTallying", inputs: [{ name: "votingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "revealResult", inputs: [{ name: "votingId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getEffectiveState", inputs: [{ name: "votingId", type: "uint256" }], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "votingCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

const VotingState = {
  Created: 0,
  Registration: 1,
  Voting: 2,
  Tallying: 3,
  Finalized: 4,
  Cancelled: 5,
} as const;

const stateLabels: Record<number, string> = {
  [VotingState.Created]: "已创建",
  [VotingState.Registration]: "注册中",
  [VotingState.Voting]: "投票中",
  [VotingState.Tallying]: "计票中",
  [VotingState.Finalized]: "已完成",
  [VotingState.Cancelled]: "已取消",
};

async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function mineBlocks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await rpc("evm_mine", []);
  }
}

async function getBlockNumber(): Promise<number> {
  const hex = (await rpc("eth_blockNumber")) as string;
  return parseInt(hex, 16);
}

function getDeployedAddresses(): { votingFactory: Address } {
  const deploymentPath = path.join(
    __dirname,
    "../../ignition/deployments/chain-31337/deployed_addresses.json"
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("未找到部署地址，请先运行: npx hardhat ignition deploy ignition/modules/VotingFactory.ts --network localhost");
  }
  const deployed = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  return {
    votingFactory: deployed["VotingFactoryModule#VotingFactory"] as Address,
  };
}

async function main() {
  console.log("🚀 自动推进测试脚本");
  console.log("   前置: 请确保 npx hardhat node 已启动\n");

  const { votingFactory } = getDeployedAddresses();
  console.log("📋 VotingFactory:", votingFactory);

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account: TEST_ACCOUNT,
    chain: hardhat,
    transport: http(RPC_URL),
  });

  const block0 = await getBlockNumber();
  console.log("📍 当前区块高度:", block0);

  // 区块模式：留有充足注册窗口。create 会挖 1 块，startRegistration 再挖 1 块
  // regStart=block+1, regEnd=block+6, voteStart=block+6, voteEnd=block+12
  const regStart = block0 + 1;
  const regEnd = block0 + 6;
  const voteStart = block0 + 6;
  const voteEnd = block0 + 12;

  const createParams = {
    title: "自动推进测试",
    description: "区块模式自动推进流程测试",
    options: ["赞成", "反对"],
    votingRule: 0, // SimpleMajority
    privacyLevel: 0, // Public
    registrationStart: BigInt(regStart),
    registrationEnd: BigInt(regEnd),
    votingStart: BigInt(voteStart),
    votingEnd: BigInt(voteEnd),
    quorum: 0n,
    autoAdvance: true,
    visibilityBitmap: 0,
    enableWhitelist: false,
    whitelist: [] as Address[],
    whitelistGroupIndexes: [] as bigint[],
    weightGroupNames: [] as string[],
    weightGroupWeights: [] as bigint[],
    registrationRule: 0, // Open
    tokenContractAddress: "0x0000000000000000000000000000000000000000" as Address,
    tokenMinBalance: 0n,
    useBlockNumber: true,
    allowExtension: true,
  };

  console.log("\n1️⃣ 创建投票 (区块模式, 自动推进)...");
  const hashCreate = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "createVoting",
    args: [createParams],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashCreate });

  const count = await publicClient.readContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "votingCount",
  });
  const votingId = Number(count);
  console.log("   投票创建成功, ID:", votingId);

  let state = await publicClient.readContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "getEffectiveState",
    args: [votingId],
  });
  console.log("   当前状态:", stateLabels[state] ?? state);

  // 挖 1 块到达 regStart
  console.log("\n2️⃣ 挖 1 块 → 到达注册开始时间...");
  await mineBlocks(1);
  const block1 = await getBlockNumber();
  console.log("   区块高度:", block1);

  console.log("\n3️⃣ 调用 startRegistration...");
  const hashReg = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "startRegistration",
    args: [votingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashReg });
  state = await publicClient.readContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "getEffectiveState",
    args: [votingId],
  });
  console.log("   状态:", stateLabels[state] ?? state);

  console.log("\n4️⃣ 注册为选民...");
  const hashRegVoter = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "registerVoter",
    args: [votingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashRegVoter });
  console.log("   注册成功");

  // 挖块到达 voteStart (regEnd=voteStart=block0+6)
  console.log("\n5️⃣ 挖块 → 到达投票开始时间...");
  const blockBeforeVote = await getBlockNumber();
  const blocksToMine = Math.max(0, regEnd - blockBeforeVote);
  if (blocksToMine > 0) await mineBlocks(blocksToMine);
  const blockVote = await getBlockNumber();
  console.log("   区块高度:", blockVote);

  console.log("\n6️⃣ 调用 startVoting...");
  const hashVote = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "startVoting",
    args: [votingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashVote });
  state = await publicClient.readContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "getEffectiveState",
    args: [votingId],
  });
  console.log("   状态:", stateLabels[state] ?? state);

  console.log("\n7️⃣ 投票 (选项 0: 赞成)...");
  const hashCast = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "castVote",
    args: [votingId, 0],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashCast });
  console.log("   投票成功");

  // 挖块越过 voteEnd (voteEnd=block0+12)
  console.log("\n8️⃣ 挖块 → 越过投票截止时间...");
  const blockBeforeTally = await getBlockNumber();
  const blocksToTally = Math.max(0, Number(voteEnd) - blockBeforeTally + 1);
  if (blocksToTally > 0) await mineBlocks(blocksToTally);
  const blockTally = await getBlockNumber();
  console.log("   区块高度:", blockTally);

  console.log("\n9️⃣ 调用 startTallying (推进到计票)...");
  const hashTally = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "startTallying",
    args: [votingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashTally });
  state = await publicClient.readContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "getEffectiveState",
    args: [votingId],
  });
  console.log("   状态:", stateLabels[state] ?? state);

  console.log("\n🔟 调用 revealResult (揭示结果)...");
  const hashReveal = await walletClient.writeContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "revealResult",
    args: [votingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashReveal });
  state = await publicClient.readContract({
    address: votingFactory,
    abi: VotingFactoryABI,
    functionName: "getEffectiveState",
    args: [votingId],
  });
  console.log("   状态:", stateLabels[state] ?? state);

  if (state === VotingState.Finalized) {
    console.log("\n✅ 自动推进流程测试通过! 投票已进入 Finalized 状态");
  } else {
    console.log("\n❌ 异常: 最终状态应为 Finalized, 实际:", stateLabels[state] ?? state);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ 测试失败:", err);
  process.exit(1);
});
