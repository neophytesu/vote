/**
 * 挖矿脚本 - 用于本地测试时推进区块高度
 *
 * 区块高度时间控制（useBlockNumber）依赖 block.number，
 * 本地 Hardhat 网络默认只在有交易时出块，此脚本可手动挖空块。
 *
 * 使用方式:
 *   npx hardhat run test/scripts/mine-blocks.ts --network localhost
 *   MINE_BLOCKS=20 npx hardhat run test/scripts/mine-blocks.ts --network localhost   # 挖 20 个块
 *   MINE_BLOCKS=100 npx hardhat run test/scripts/mine-blocks.ts --network localhost  # 挖 100 个块
 *
 * 前置：需先启动 npx hardhat node
 */
const RPC_URL = process.env.HARDHAT_NETWORK === "localhost" ? "http://127.0.0.1:8545" : "http://127.0.0.1:8545";

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

async function main() {
  const blocks = process.env.MINE_BLOCKS ? parseInt(process.env.MINE_BLOCKS, 10) : 10;

  if (isNaN(blocks) || blocks < 1) {
    console.error("请设置 MINE_BLOCKS 环境变量，例如: MINE_BLOCKS=20 npx hardhat run test/scripts/mine-blocks.ts --network localhost");
    process.exit(1);
  }

  const beforeBlock = (await rpc("eth_blockNumber")) as string;
  const beforeNum = parseInt(beforeBlock, 16);

  for (let i = 0; i < blocks; i++) {
    await rpc("evm_mine", []);
  }

  const afterBlock = (await rpc("eth_blockNumber")) as string;
  const afterNum = parseInt(afterBlock, 16);

  console.log(`✅ 已挖 ${blocks} 个块`);
  console.log(`   区块高度: ${beforeNum} → ${afterNum}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
