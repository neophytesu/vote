/**
 * 测试「按名称或内容搜索」的筛选逻辑
 * 运行: node front_end/scripts/test-proposal-search.mjs
 * 或在 front_end 目录: node scripts/test-proposal-search.mjs
 */

// 与 App.tsx 中一致的筛选逻辑：按 title、description 不区分大小写包含匹配
function filterProposalsByKeyword(keyword, list) {
  const k = String(keyword).trim().toLowerCase();
  if (!k) return list;
  return list.filter(
    (p) =>
      p.title.toLowerCase().includes(k) || p.description.toLowerCase().includes(k)
  );
}

// 模拟提案（仅需 title、description 用于测试）
const mockProposals = [
  { id: 1, title: "社区资金分配提案", description: "讨论本季度 DAO 金库的分配方案" },
  { id: 2, title: "技术升级投票", description: "是否将合约升级至 v2，包含 gas 优化" },
  { id: 3, title: "治理规则修订", description: "修订社区治理规则与提案门槛" },
  { id: 4, title: "NFT 白名单提案", description: "新增一批 NFT 持有者白名单" },
];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runTests() {
  let passed = 0;

  // 1. 空关键词返回全部
  const emptyResult = filterProposalsByKeyword("", mockProposals);
  assert(emptyResult.length === 4, "空关键词应返回全部 4 条");
  passed++;
  console.log("✓ 空关键词返回全部提案");

  // 2. 仅空格视为空
  const spaceResult = filterProposalsByKeyword("   ", mockProposals);
  assert(spaceResult.length === 4, "仅空格应返回全部");
  passed++;
  console.log("✓ 仅空格视为空，返回全部");

  // 3. 按标题匹配（完整词）
  const byTitle = filterProposalsByKeyword("技术升级", mockProposals);
  assert(byTitle.length === 1 && byTitle[0].id === 2, "按标题应匹配「技术升级投票」");
  passed++;
  console.log("✓ 按标题匹配");

  // 4. 按描述匹配
  const byDesc = filterProposalsByKeyword("DAO", mockProposals);
  assert(byDesc.length === 1 && byDesc[0].id === 1, "按描述应匹配含 DAO 的提案");
  passed++;
  console.log("✓ 按描述匹配");

  // 5. 不区分大小写
  const lower = filterProposalsByKeyword("nft", mockProposals);
  const upper = filterProposalsByKeyword("NFT", mockProposals);
  assert(lower.length === 1 && upper.length === 1 && lower[0].id === upper[0].id, "大小写不敏感");
  passed++;
  console.log("✓ 不区分大小写");

  // 6. 无匹配返回空数组
  const noMatch = filterProposalsByKeyword("不存在的关键词xyz", mockProposals);
  assert(noMatch.length === 0, "无匹配应返回空数组");
  passed++;
  console.log("✓ 无匹配返回空数组");

  // 7. 关键词匹配多条（标题或描述含「提案」）
  const multi = filterProposalsByKeyword("提案", mockProposals);
  assert(multi.length >= 2, "「提案」应匹配多条（标题或描述）");
  passed++;
  console.log("✓ 关键词匹配多条");

  // 8. 空列表输入
  const emptyList = filterProposalsByKeyword("任意", []);
  assert(Array.isArray(emptyList) && emptyList.length === 0, "空列表输入返回空数组");
  passed++;
  console.log("✓ 空列表输入");

  return passed;
}

try {
  const passed = runTests();
  console.log("\n全部通过，共 " + passed + " 项。");
} catch (err) {
  console.error("\n失败:", err.message);
  process.exit(1);
}
