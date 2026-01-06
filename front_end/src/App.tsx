import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useWallet, getChainName } from "@/hooks/useWallet";
import type { WalletState } from "@/hooks/useWallet";

// 模拟数据
const mockProposals = [
  {
    id: 1,
    title: "社区资金分配提案",
    description: "将 10% 的社区资金用于开发者激励计划",
    status: "voting",
    votesFor: 1247,
    votesAgainst: 523,
    totalVoters: 3500,
    endTime: "2026-01-10T18:00:00",
    privacy: "encrypted",
    rule: "quadratic",
  },
  {
    id: 2,
    title: "协议升级 V2.0",
    description: "实施新的治理框架和投票机制升级",
    status: "registration",
    votesFor: 0,
    votesAgainst: 0,
    totalVoters: 2100,
    endTime: "2026-01-15T12:00:00",
    privacy: "anonymous",
    rule: "simple",
  },
  {
    id: 3,
    title: "新增流动性池",
    description: "为 ETH/USDC 交易对创建新的流动性激励池",
    status: "finalized",
    votesFor: 2890,
    votesAgainst: 410,
    totalVoters: 3300,
    endTime: "2026-01-02T00:00:00",
    privacy: "public",
    rule: "weighted",
  },
];

const statusConfig: Record<
  string,
  { label: string; color: string; step: number }
> = {
  created: {
    label: "已创建",
    color: "bg-zinc-500",
    step: 1,
  },
  registration: {
    label: "注册中",
    color: "bg-amber-500",
    step: 2,
  },
  voting: {
    label: "投票中",
    color: "bg-emerald-500",
    step: 3,
  },
  tallying: {
    label: "计票中",
    color: "bg-blue-500",
    step: 4,
  },
  finalized: {
    label: "已完成",
    color: "bg-violet-500",
    step: 5,
  },
};

const privacyLabels: Record<string, string> = {
  public: "公开投票",
  anonymous: "匿名投票",
  encrypted: "加密投票",
  full: "完全隐私",
};

const ruleLabels: Record<string, string> = {
  simple: "简单多数",
  weighted: "加权投票",
  quadratic: "二次方投票",
  ranked: "排序选择",
};

interface HeaderProps {
  wallet: WalletState;
  onConnect: () => void;
  onDisconnect: () => void;
}

function Header({ wallet, onConnect, onDisconnect }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              ZK Vote
            </h1>
            <p className="text-xs text-zinc-500">
              隐私保护的去中心化投票系统
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* 网络指示器 */}
          <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-800">
            <div
              className={`w-2 h-2 rounded-full ${
                wallet.isConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
              }`}
            />
            <span className="text-sm text-zinc-400">
              {wallet.isConnected ? getChainName(wallet.chainId) : "未连接"}
            </span>
          </div>

          {/* 钱包按钮 */}
          {wallet.isConnected ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-3 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-violet-500/50 transition-colors"
              >
                {/* MetaMask 图标 */}
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-zinc-100">
                    {wallet.shortAddress}
                  </p>
                  {wallet.balance && (
                    <p className="text-xs text-zinc-500">
                      {parseFloat(wallet.balance).toFixed(4)} ETH
                    </p>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-zinc-500 transition-transform ${
                    showMenu ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* 下拉菜单 */}
              {showMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl overflow-hidden z-50">
                  <div className="p-3 border-b border-zinc-800">
                    <p className="text-xs text-zinc-500">已连接地址</p>
                    <p className="text-sm font-mono text-zinc-300 truncate">
                      {wallet.address}
                    </p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => {
                        if (wallet.address) {
                          navigator.clipboard.writeText(wallet.address);
                        }
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      复制地址
                    </button>
                    <button
                      onClick={() => {
                        onDisconnect();
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      断开连接
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              onClick={onConnect}
              disabled={wallet.isConnecting}
              variant="outline"
              className="border-zinc-700 hover:bg-zinc-800 hover:border-violet-500/50 text-zinc-100"
            >
              {wallet.isConnecting ? (
                <>
                  <svg
                    className="w-4 h-4 mr-2 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  连接中...
                </>
              ) : (
                <>
                  {/* MetaMask Fox Icon */}
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 35 33"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M32.958 1L19.42 11.218l2.503-5.927L32.958 1z"
                      fill="#E17726"
                      stroke="#E17726"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.042 1l13.37 10.323-2.335-6.032L2.042 1zM28.08 23.535l-3.593 5.498 7.694 2.118 2.206-7.488-6.307-.128zM.621 23.663l2.193 7.488 7.694-2.118-3.593-5.498-6.294.128z"
                      fill="#E27625"
                      stroke="#E27625"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.08 14.515l-2.142 3.24 7.63.347-.255-8.21-5.233 4.623zM24.92 14.515l-5.296-4.729-.17 8.316 7.618-.347-2.152-3.24zM10.508 29.033l4.591-2.235-3.967-3.096-.624 5.331zM19.901 26.798l4.579 2.235-.612-5.331-3.967 3.096z"
                      fill="#E27625"
                      stroke="#E27625"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M24.48 29.033l-4.579-2.235.369 3.003-.04 1.267 4.25-2.035zM10.508 29.033l4.263 2.035-.027-1.267.357-3.003-4.593 2.235z"
                      fill="#D5BFB2"
                      stroke="#D5BFB2"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14.872 21.85l-3.829-1.127 2.705-1.24 1.124 2.367zM20.128 21.85l1.124-2.367 2.718 1.24-3.842 1.127z"
                      fill="#233447"
                      stroke="#233447"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.508 29.033l.637-5.498-4.23.128 3.593 5.37zM23.855 23.535l.625 5.498 3.6-5.37-4.225-.128zM27.072 17.755l-7.618.347.707 3.748 1.124-2.367 2.718 1.24 3.069-2.968zM11.043 20.723l2.705-1.24 1.124 2.367.707-3.748-7.63-.347 3.094 2.968z"
                      fill="#CC6228"
                      stroke="#CC6228"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.938 17.755l3.195 6.228-.102-3.26-3.093-2.968zM23.97 20.723l-.115 3.26 3.207-6.228-3.092 2.968zM15.568 18.102l-.707 3.748.892 4.6.204-6.062-.389-2.286zM19.454 18.102l-.376 2.273.179 6.075.893-4.6-.696-3.748z"
                      fill="#E27525"
                      stroke="#E27525"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20.16 21.85l-.893 4.6.638.44 3.967-3.096.115-3.26-3.828 1.316zM11.043 20.534l.102 3.26 3.967 3.096.638-.44-.893-4.6-3.814-1.316z"
                      fill="#F5841F"
                      stroke="#F5841F"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M20.211 31.068l.04-1.267-.345-.296h-5.055l-.333.296.028 1.267-4.263-2.035 1.492 1.222 3.018 2.095h5.136l3.031-2.095 1.492-1.222-4.241 2.035z"
                      fill="#C0AC9D"
                      stroke="#C0AC9D"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M19.9 26.798l-.637-.44h-3.685l-.638.44-.357 3.003.333-.296h5.055l.345.296-.416-3.003z"
                      fill="#161616"
                      stroke="#161616"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M33.519 11.765l1.143-5.54L32.958 1l-13.06 9.694 5.022 4.249 7.1 2.073 1.568-1.832-.683-.49 1.085-.99-.83-.639 1.085-.831-.715-.469zM.338 6.225l1.155 5.54-.74.55 1.098.83-.83.64 1.085.989-.683.49 1.568 1.831 7.1-2.073 5.022-4.249L2.042 1 .338 6.225z"
                      fill="#763E1A"
                      stroke="#763E1A"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M32.02 17.016l-7.1-2.073 2.152 3.24-3.207 6.228 4.225-.051h6.307l-2.377-7.344zM10.08 14.943l-7.1 2.073-2.364 7.344h6.295l4.224.05-3.195-6.226 2.14-3.24zM19.454 18.102l.453-7.82 2.063-5.573h-9.153l2.063 5.573.453 7.82.17 2.3.013 6.048h3.685l.013-6.049.24-2.299z"
                      fill="#F5841F"
                      stroke="#F5841F"
                      strokeWidth=".25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  连接 MetaMask
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {wallet.error && (
        <div className="max-w-7xl mx-auto px-6 pb-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {wallet.error}
          </div>
        </div>
      )}
    </header>
  );
}

function StatsCards() {
  const stats = [
    {
      label: "活跃提案",
      value: "12",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      ),
      change: "+3",
      color: "text-emerald-400",
    },
    {
      label: "注册选民",
      value: "8,942",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
      change: "+127",
      color: "text-blue-400",
    },
    {
      label: "总投票数",
      value: "47.2K",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
      change: "+2.3K",
      color: "text-violet-400",
    },
    {
      label: "隐私投票",
      value: "89%",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      ),
      change: "+5%",
      color: "text-fuchsia-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors"
        >
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zinc-500">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
              <div
                className={`p-2 rounded-lg bg-zinc-800/50 ${stat.color}`}
              >
                {stat.icon}
              </div>
            </div>
            <p className={`text-xs mt-2 ${stat.color}`}>
              {stat.change} 本周
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: (typeof mockProposals)[0] }) {
  const status = statusConfig[proposal.status];
  const totalVotes = proposal.votesFor + proposal.votesAgainst;
  const forPercentage =
    totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 50;
  const participationRate =
    proposal.totalVoters > 0
      ? ((totalVotes / proposal.totalVoters) * 100).toFixed(1)
      : "0";

  const timeRemaining = () => {
    const end = new Date(proposal.endTime);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return "已结束";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}天 ${hours}小时`;
    return `${hours}小时`;
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 hover:border-violet-500/30 transition-all group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg group-hover:text-violet-400 transition-colors truncate">
              {proposal.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {proposal.description}
            </CardDescription>
          </div>
          <Badge
            className={`${status.color} text-white shrink-0`}
          >
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 标签 */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
            🔒 {privacyLabels[proposal.privacy]}
          </Badge>
          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
            📊 {ruleLabels[proposal.rule]}
          </Badge>
          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
            ⏱️ {timeRemaining()}
          </Badge>
        </div>

        {/* 投票进度 */}
        {proposal.status === "voting" || proposal.status === "finalized" ? (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-400">
                赞成 {proposal.votesFor.toLocaleString()}
              </span>
              <span className="text-rose-400">
                反对 {proposal.votesAgainst.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${forPercentage}%` }}
              />
              <div
                className="bg-gradient-to-r from-rose-400 to-rose-500"
                style={{ width: `${100 - forPercentage}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 text-center">
              参与率: {participationRate}% ({totalVotes.toLocaleString()} /{" "}
              {proposal.totalVoters.toLocaleString()})
            </p>
          </div>
        ) : (
          <div className="py-2">
            <p className="text-sm text-zinc-500 text-center">
              已注册选民: {proposal.totalVoters.toLocaleString()}
            </p>
          </div>
        )}

        {/* 阶段指示器 */}
        <div className="flex items-center gap-1 pt-2">
          {[1, 2, 3, 4, 5].map((step) => (
            <div
              key={step}
              className={`flex-1 h-1 rounded-full transition-colors ${
                step <= status.step
                  ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  : "bg-zinc-800"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-zinc-600 text-center">
          阶段 {status.step}/5:{" "}
          {["创建", "注册", "投票", "计票", "完成"][status.step - 1]}
        </p>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          {proposal.status === "registration" && (
            <Button className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
              注册投票
            </Button>
          )}
          {proposal.status === "voting" && (
            <Dialog>
              <DialogTrigger asChild>
                <Button className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                  参与投票
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                <DialogHeader>
                  <DialogTitle className="text-zinc-100">{proposal.title}</DialogTitle>
                  <DialogDescription className="text-zinc-400">{proposal.description}</DialogDescription>
                </DialogHeader>
                <VoteDialog />
              </DialogContent>
            </Dialog>
          )}
          {proposal.status === "finalized" && (
            <Button
              variant="outline"
              className="flex-1 border-zinc-700 hover:border-violet-500 text-zinc-100"
            >
              查看结果
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-500 hover:text-white"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VoteDialog() {
  const [selected, setSelected] = useState<"for" | "against" | null>(null);
  const [step, setStep] = useState(1);

  return (
    <div className="space-y-6 py-4">
      {step === 1 && (
        <>
          <div className="space-y-3">
            <button
              onClick={() => setSelected("for")}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                selected === "for"
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selected === "for" ? "bg-emerald-500" : "bg-zinc-800"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">赞成</p>
                  <p className="text-sm text-zinc-400">支持该提案通过</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setSelected("against")}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                selected === "against"
                  ? "border-rose-500 bg-rose-500/10"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selected === "against" ? "bg-rose-500" : "bg-zinc-800"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">反对</p>
                  <p className="text-sm text-zinc-400">不支持该提案</p>
                </div>
              </div>
            </button>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-3 flex items-start gap-2">
            <svg
              className="w-5 h-5 text-violet-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <div className="text-xs text-zinc-400">
              <p className="font-medium text-zinc-300">隐私保护投票</p>
              <p>
                您的投票将使用 Semaphore 零知识证明匿名提交，同时使用 Paillier
                同态加密保护投票内容。
              </p>
            </div>
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!selected}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
          >
            下一步：生成证明
          </Button>
        </>
      )}

      {step === 2 && (
        <div className="text-center space-y-6 py-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 flex items-center justify-center animate-pulse">
            <svg
              className="w-8 h-8 text-white animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-zinc-100">正在生成零知识证明...</p>
            <p className="text-sm text-zinc-400 mt-1">
              证明您是合法选民，同时不泄露身份
            </p>
          </div>
          <Progress value={66} className="h-2" />
          <div className="text-xs space-y-1">
            <p className="text-emerald-400">✓ 验证 Semaphore 身份承诺</p>
            <p className="text-emerald-400">✓ 检查 Merkle 树成员资格</p>
            <p className="text-violet-400">○ 生成 ZK-SNARK 证明中...</p>
            <p className="text-zinc-500">○ 同态加密投票内容</p>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateProposalCard() {
  return (
    <Card className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border-violet-500/20 hover:border-violet-500/40 transition-colors">
      <CardContent className="pt-6 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-lg">创建新提案</h3>
          <p className="text-sm text-zinc-500 mt-1">
            配置投票规则、准入控制、隐私级别等六大模块
          </p>
        </div>
        <Button className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
          开始创建
        </Button>
      </CardContent>
    </Card>
  );
}

function TechStack() {
  const techs = [
    {
      name: "Semaphore",
      desc: "零知识身份证明",
      icon: "🔐",
    },
    {
      name: "Paillier",
      desc: "加法同态加密",
      icon: "🔢",
    },
    {
      name: "Merkle Tree",
      desc: "成员资格证明",
      icon: "🌳",
    },
    {
      name: "阈值解密",
      desc: "t-of-n 委员会协作",
      icon: "🗝️",
    },
  ];

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-base">加密技术栈</CardTitle>
        <CardDescription>保障投票安全与隐私</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {techs.map((tech) => (
          <div
            key={tech.name}
            className="p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
          >
            <span className="text-2xl">{tech.icon}</span>
            <p className="font-medium text-sm mt-2">{tech.name}</p>
            <p className="text-xs text-zinc-500">{tech.desc}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function App() {
  const wallet = useWallet();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* 背景效果 */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-fuchsia-500/20 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(63 63 70) 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <Header
        wallet={wallet}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
      />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* 统计卡片 */}
        <StatsCards />

        {/* 主内容区 */}
        <Tabs defaultValue="all" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="all" className="text-zinc-400 data-[state=active]:text-white data-[state=active]:bg-zinc-800">全部提案</TabsTrigger>
              <TabsTrigger value="active" className="text-zinc-400 data-[state=active]:text-white data-[state=active]:bg-zinc-800">进行中</TabsTrigger>
              <TabsTrigger value="completed" className="text-zinc-400 data-[state=active]:text-white data-[state=active]:bg-zinc-800">已完成</TabsTrigger>
              <TabsTrigger value="my" className="text-zinc-400 data-[state=active]:text-white data-[state=active]:bg-zinc-800">我的投票</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 hover:border-violet-500 text-zinc-100"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                筛选
              </Button>
            </div>
          </div>

          <TabsContent value="all" className="space-y-0">
            <div className="grid lg:grid-cols-3 gap-6">
              {/* 提案列表 */}
              <div className="lg:col-span-2 space-y-4">
                {mockProposals.map((proposal) => (
                  <ProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>

              {/* 侧边栏 */}
              <div className="space-y-4">
                <CreateProposalCard />
                <TechStack />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="active">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {mockProposals
                  .filter(
                    (p) =>
                      p.status === "voting" || p.status === "registration"
                  )
                  .map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
              </div>
              <div className="space-y-4">
                <CreateProposalCard />
                <TechStack />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="completed">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {mockProposals
                  .filter((p) => p.status === "finalized")
                  .map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
              </div>
              <div className="space-y-4">
                <CreateProposalCard />
                <TechStack />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="my">
            {wallet.isConnected ? (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {/* 用户信息卡片 */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                          <span className="text-2xl font-bold text-white">
                            {wallet.shortAddress?.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-zinc-100">
                            {wallet.shortAddress}
                          </p>
                          <p className="text-sm text-zinc-500 font-mono">
                            {wallet.address}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <Badge
                              variant="outline"
                              className="border-emerald-500/50 text-emerald-400"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                              {getChainName(wallet.chainId)}
                            </Badge>
                            {wallet.balance && (
                              <span className="text-sm text-zinc-400">
                                {parseFloat(wallet.balance).toFixed(4)} ETH
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 投票记录空状态 */}
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                        <svg
                          className="w-8 h-8 text-zinc-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-300">
                        暂无投票记录
                      </h3>
                      <p className="text-sm text-zinc-500 mt-1">
                        您还没有参与任何投票，去看看有哪些提案吧！
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-4">
                  <CreateProposalCard />
                  <TechStack />
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 flex items-center justify-center mb-6">
                  <svg
                    className="w-10 h-10 text-violet-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-zinc-200">
                  请先连接钱包
                </h3>
                <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto">
                  连接您的 MetaMask 钱包后，即可查看投票记录、参与提案投票
                </p>
                <Button
                  onClick={wallet.connect}
                  disabled={wallet.isConnecting}
                  className="mt-6 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 px-8"
                >
                  {wallet.isConnecting ? (
                    <>
                      <svg
                        className="w-4 h-4 mr-2 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      连接中...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5 mr-2"
                        viewBox="0 0 35 33"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M32.958 1L19.42 11.218l2.503-5.927L32.958 1z"
                          fill="#E17726"
                          stroke="#E17726"
                          strokeWidth=".25"
                        />
                        <path
                          d="M2.042 1l13.37 10.323-2.335-6.032L2.042 1zM28.08 23.535l-3.593 5.498 7.694 2.118 2.206-7.488-6.307-.128zM.621 23.663l2.193 7.488 7.694-2.118-3.593-5.498-6.294.128z"
                          fill="#E27625"
                          stroke="#E27625"
                          strokeWidth=".25"
                        />
                      </svg>
                      连接 MetaMask
                    </>
                  )}
                </Button>
                {wallet.error && (
                  <p className="text-sm text-rose-400 mt-4">{wallet.error}</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <span>🔒</span>
              <span>
                由 Semaphore ZKP + Paillier 同态加密驱动的隐私投票系统
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-zinc-600">
              <a href="#" className="hover:text-violet-400 transition-colors">
                文档
              </a>
              <a href="#" className="hover:text-violet-400 transition-colors">
                GitHub
              </a>
              <a href="#" className="hover:text-violet-400 transition-colors">
                社区
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
