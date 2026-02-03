import { useState, useCallback, useEffect } from "react";
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
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useWallet, getChainName } from "@/hooks/useWallet";
import type { WalletState } from "@/hooks/useWallet";
import { VotingState, VotingRule, PrivacyLevel } from "@/contracts/abi";
import {
  encodeVisibilityBitmap,
  decodeVisibilityBitmap,
  checkVisibility,
  VisibilityLevel,
} from "@/contracts/visibility";
import { useVotingFactory, type VotingDetails } from "@/hooks/useVotingFactory";
import { useStatisticsCenter } from "@/hooks/useStatisticsCenter";
import {
  Lock,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  Clock,
  Timer,
  Crown,
  Calendar,
  KeyRound,
  TreeDeciduous,
  BarChart3,
  Hash,
  Globe,
  ImageIcon,
  Coins,
  Users,
  UserCheck,
  Upload,
  X,
} from "lucide-react";

// 本地提案接口（扩展合约数据，添加用户状态）
interface LocalProposal {
  id: number;
  title: string;
  description: string;
  options: string[];
  status: VotingState;
  voteCounts: number[];
  totalVoters: number;
  endTime: string;
  privacy: PrivacyLevel;
  rule: VotingRule;
  isRegistered?: boolean;
  hasVoted?: boolean;
  creator: string;           // 创建者地址
  autoAdvance: boolean;      // 是否自动推进
  registrationStart: number; // 注册开始时间
  registrationEnd: number;   // 注册结束时间
  votingStart: number;       // 投票开始时间
  votingEnd: number;         // 投票结束时间
  visibilityBitmap: number;  // 可见性配置位图
}

// 将合约数据转换为本地提案格式
function convertToLocalProposal(voting: VotingDetails, userStatus?: { registered: boolean; voted: boolean }): LocalProposal {
  return {
    id: voting.id,
    title: voting.title,
    description: voting.description,
    options: voting.options,
    status: voting.state,
    voteCounts: voting.voteCounts,
    totalVoters: voting.totalVoters,
    endTime: new Date(voting.votingEnd * 1000).toISOString(),
    privacy: voting.privacyLevel,
    rule: voting.votingRule,
    isRegistered: userStatus?.registered ?? false,
    hasVoted: userStatus?.voted ?? false,
    creator: voting.creator,
    autoAdvance: voting.autoAdvance,
    registrationStart: voting.registrationStart,
    registrationEnd: voting.registrationEnd,
    votingStart: voting.votingStart,
    votingEnd: voting.votingEnd,
    visibilityBitmap: voting.visibilityBitmap,
  };
}

// 状态配置 - 使用枚举索引
const statusConfig: Record<VotingState, { label: string; color: string; step: number }> = {
  [VotingState.Created]: {
    label: "已创建",
    color: "bg-zinc-500",
    step: 1,
  },
  [VotingState.Registration]: {
    label: "注册中",
    color: "bg-amber-500",
    step: 2,
  },
  [VotingState.Voting]: {
    label: "投票中",
    color: "bg-emerald-500",
    step: 3,
  },
  [VotingState.Tallying]: {
    label: "计票中",
    color: "bg-blue-500",
    step: 4,
  },
  [VotingState.Finalized]: {
    label: "已完成",
    color: "bg-violet-500",
    step: 5,
  },
};

// 隐私级别标签
const privacyLabels: Record<PrivacyLevel, string> = {
  [PrivacyLevel.Public]: "公开投票",
  [PrivacyLevel.Anonymous]: "匿名投票",
  [PrivacyLevel.Encrypted]: "加密投票",
  [PrivacyLevel.FullPrivacy]: "完全隐私",
};

// 投票规则标签
const ruleLabels: Record<VotingRule, string> = {
  [VotingRule.SimpleMajority]: "简单多数",
  [VotingRule.Weighted]: "加权投票",
  [VotingRule.Quadratic]: "二次方投票",
  [VotingRule.RankedChoice]: "排序选择",
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

interface StatsCardsProps {
  globalStats: {
    totalVotings: number;
    totalVoters: number;
    totalVotesCast: number;
    activeVotings: number;
  } | null;
  privacyStats: {
    publicCount: number;
    anonymousCount: number;
    encryptedCount: number;
    fullPrivacyCount: number;
  } | null;
  isLoading: boolean;
}

function StatsCards({ globalStats, privacyStats, isLoading }: StatsCardsProps) {
  // 计算隐私投票占比
  const calculatePrivacyPercentage = () => {
    if (!privacyStats) return 0;
    const total = privacyStats.publicCount + privacyStats.anonymousCount + 
                  privacyStats.encryptedCount + privacyStats.fullPrivacyCount;
    if (total === 0) return 0;
    const privacyVotes = privacyStats.anonymousCount + privacyStats.encryptedCount + 
                         privacyStats.fullPrivacyCount;
    return Math.round((privacyVotes / total) * 100);
  };

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  };

  const stats = [
    {
      label: "活跃提案",
      value: isLoading ? "..." : formatNumber(globalStats?.activeVotings ?? 0),
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
      color: "text-emerald-400",
    },
    {
      label: "注册选民",
      value: isLoading ? "..." : formatNumber(globalStats?.totalVoters ?? 0),
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
      color: "text-blue-400",
    },
    {
      label: "总投票数",
      value: isLoading ? "..." : formatNumber(globalStats?.totalVotesCast ?? 0),
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
      color: "text-violet-400",
    },
    {
      label: "隐私投票",
      value: isLoading ? "..." : `${calculatePrivacyPercentage()}%`,
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// 投票记录类型
interface VoteRecord {
  voter: string;
  optionIndex: number;
  timestamp: number;
}

interface ProposalCardProps {
  proposal: LocalProposal;
  wallet: WalletState;
  onRegister: (proposalId: number) => void;
  onVote: (proposalId: number, optionIndex: number) => void;
  onStartRegistration: (proposalId: number) => void;
  onStartVoting: (proposalId: number) => void;
  onStartTallying: (proposalId: number) => void;
  onRevealResult: (proposalId: number) => void;
  onLoadVoteRecords?: (proposalId: number) => Promise<VoteRecord[] | null>;
  onLoadRegisteredVoters?: (proposalId: number) => Promise<string[] | null>;
}

// 选项颜色配置
const optionColorConfig = [
  { bg: "bg-emerald-500", text: "text-emerald-400", gradient: "from-emerald-500 to-emerald-400" },
  { bg: "bg-rose-500", text: "text-rose-400", gradient: "from-rose-500 to-rose-400" },
  { bg: "bg-blue-500", text: "text-blue-400", gradient: "from-blue-500 to-blue-400" },
  { bg: "bg-amber-500", text: "text-amber-400", gradient: "from-amber-500 to-amber-400" },
  { bg: "bg-violet-500", text: "text-violet-400", gradient: "from-violet-500 to-violet-400" },
  { bg: "bg-cyan-500", text: "text-cyan-400", gradient: "from-cyan-500 to-cyan-400" },
];

function ProposalCard({ proposal, wallet, onRegister, onVote, onStartRegistration, onStartVoting, onStartTallying, onRevealResult, onLoadVoteRecords, onLoadRegisteredVoters }: ProposalCardProps) {
  const [showVoteDetails, setShowVoteDetails] = useState(false);
  const [voteRecords, setVoteRecords] = useState<VoteRecord[]>([]);
  const [notVotedAddresses, setNotVotedAddresses] = useState<string[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const status = statusConfig[proposal.status];
  const totalVotes = proposal.voteCounts.reduce((a, b) => a + b, 0);
  const participationRate =
    proposal.totalVoters > 0
      ? ((totalVotes / proposal.totalVoters) * 100).toFixed(1)
      : "0";

  // 计算各选项百分比
  const optionPercentages = proposal.voteCounts.map(count => 
    totalVotes > 0 ? (count / totalVotes) * 100 : 0
  );

  // 找出领先选项
  const maxVotes = Math.max(...proposal.voteCounts);
  const leadingIndex = proposal.voteCounts.indexOf(maxVotes);

  // 判断当前用户是否为创建者
  const isCreator = wallet.address?.toLowerCase() === proposal.creator?.toLowerCase();
  
  // 判断当前用户是否为参与者（已注册选民）
  const isParticipant = proposal.isRegistered ?? false;

  // 解码可见性配置
  const visibilityConfig = decodeVisibilityBitmap(proposal.visibilityBitmap || 0);
  
  // 检查各项可见性权限
  const canViewVoteCounts = checkVisibility(visibilityConfig.voteCounts, isCreator, isParticipant);
  const canViewVoteDetails = checkVisibility(visibilityConfig.voteDetails, isCreator, isParticipant);
  const canViewProgress = checkVisibility(visibilityConfig.progress, isCreator, isParticipant);
  const canViewVoterList = checkVisibility(visibilityConfig.voterList, isCreator, isParticipant);
  const canViewResult = checkVisibility(visibilityConfig.result, isCreator, isParticipant);
  
  // 判断是否可以推进状态
  // 自动模式：任何人可推进；手动模式：仅创建者可推进
  const canAdvanceState = proposal.autoAdvance || isCreator;

  // 计算时间条件是否满足（仅自动模式需要检查时间）
  const now = Math.floor(Date.now() / 1000);
  // 手动模式：无时间限制，随时可推进
  const canStartRegistration = !proposal.autoAdvance || now >= proposal.registrationStart;
  const canStartVoting = !proposal.autoAdvance || now >= proposal.votingStart;
  const canStartTallying = !proposal.autoAdvance || now > proposal.votingEnd;

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
            <Lock className="w-3 h-3 inline mr-1" /> {privacyLabels[proposal.privacy]}
          </Badge>
          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
            <BarChart3 className="w-3 h-3 inline mr-1" /> {ruleLabels[proposal.rule]}
          </Badge>
          <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
            <Clock className="w-3 h-3 inline mr-1" /> {timeRemaining()}
          </Badge>
          <Badge 
            variant="outline" 
            className={`text-xs ${proposal.autoAdvance ? "border-emerald-500/50 text-emerald-400" : "border-amber-500/50 text-amber-400"}`}
          >
            <Timer className="w-3 h-3 inline mr-1" /> {proposal.autoAdvance ? "自动推进" : "手动推进"}
          </Badge>
          {isCreator && (
            <Badge variant="outline" className="text-xs border-violet-500/50 text-violet-400">
              <Crown className="w-3 h-3 inline mr-1" /> 创建者
            </Badge>
          )}
        </div>

        {/* 投票进度 - 支持多选项，根据可见性配置控制显示 */}
        {proposal.status === VotingState.Voting || proposal.status === VotingState.Finalized ? (
          <div className="space-y-3">
            {/* 各选项票数 - 根据可见性控制 */}
            {(proposal.status === VotingState.Finalized ? canViewResult : canViewVoteCounts) ? (
              <div className="space-y-2">
                {proposal.options.map((option, index) => {
                  const color = optionColorConfig[index % optionColorConfig.length];
                  const votes = proposal.voteCounts[index] || 0;
                  const percentage = optionPercentages[index];
                  const isLeading = index === leadingIndex && totalVotes > 0;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className={`${color.text} flex items-center gap-1.5`}>
                          {isLeading && <Crown className="w-3 h-3 inline mr-1" />}
                          {option}
                        </span>
                        <span className="text-zinc-400">
                          {votes.toLocaleString()} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${color.gradient} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center">
                <EyeOff className="w-5 h-5 mx-auto text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500">
                  {proposal.status === VotingState.Finalized ? "结果未公开" : "票数未公开"}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  {isCreator ? "" : isParticipant ? "仅创建者可见" : "仅参与者可见"}
                </p>
              </div>
            )}
            
            {/* 参与率 - 根据进度可见性控制 */}
            {canViewProgress ? (
              <p className="text-xs text-zinc-500 text-center pt-1">
                参与率: {participationRate}% ({totalVotes.toLocaleString()} / {proposal.totalVoters.toLocaleString()})
              </p>
            ) : (
              <p className="text-xs text-zinc-600 text-center pt-1">
                进度信息未公开
              </p>
            )}
          </div>
        ) : (
          <div className="py-2">
            {/* 选民数量 - 根据选民列表可见性控制 */}
            {canViewVoterList ? (
              <p className="text-sm text-zinc-500 text-center">
                已注册选民: {proposal.totalVoters.toLocaleString()}
              </p>
            ) : (
              <p className="text-sm text-zinc-600 text-center flex items-center justify-center gap-2">
                <EyeOff className="w-4 h-4" /> 选民信息未公开
              </p>
            )}
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

        {/* 投票内容（谁投了什么）- 根据可见性控制，使用弹窗展示 */}
        {(proposal.status === VotingState.Voting || proposal.status === VotingState.Finalized) && (
          <div className="pt-2 border-t border-zinc-800">
            {canViewVoteDetails ? (
              <Dialog open={showVoteDetails} onOpenChange={setShowVoteDetails}>
                <DialogTrigger asChild>
                  <button
                    onClick={async () => {
                      if (voteRecords.length === 0 && !loadingRecords) {
                        setLoadingRecords(true);
                        const records = onLoadVoteRecords ? await onLoadVoteRecords(proposal.id) : null;
                        if (records) setVoteRecords(records);
                        if (onLoadRegisteredVoters) {
                          const registered = await onLoadRegisteredVoters(proposal.id);
                          if (registered) {
                            const votedSet = new Set((records || []).map((r) => r.voter.toLowerCase()));
                            setNotVotedAddresses(registered.filter((addr) => !votedSet.has(addr.toLowerCase())));
                          }
                        }
                        setLoadingRecords(false);
                      }
                    }}
                    className="w-full text-xs text-zinc-400 hover:text-zinc-300 flex items-center justify-center gap-1 py-1 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    查看投票详情
                    {loadingRecords && <span className="ml-1 animate-spin">⏳</span>}
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="text-zinc-100 flex items-center gap-2">
                      <Eye className="w-5 h-5 text-violet-400" />
                      投票详情 - {proposal.title}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                      共 {voteRecords.length} 人已投票，{notVotedAddresses.length} 人未投票
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {voteRecords.length > 0 ? (
                      voteRecords.map((record, idx) => {
                        const color = optionColorConfig[record.optionIndex % optionColorConfig.length];
                        const optionName = proposal.options[record.optionIndex] || `选项${record.optionIndex + 1}`;
                        const voteTime = new Date(record.timestamp * 1000).toLocaleString();
                        return (
                          <div 
                            key={`voted-${idx}`} 
                            className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-300 font-mono break-all">
                                {record.voter}
                              </p>
                              <p className="text-xs text-zinc-500 mt-1">
                                投票时间: {voteTime}
                              </p>
                            </div>
                            <div className={`shrink-0 px-3 py-1.5 rounded-lg bg-gradient-to-r ${color.gradient} text-white text-sm font-medium`}>
                              {optionName}
                            </div>
                          </div>
                        );
                      })
                    ) : null}
                    {/* 未投票的人 - 与上面卡片样式一致 */}
                    {notVotedAddresses.length > 0 && notVotedAddresses.map((addr, idx) => (
                      <div
                        key={`notvoted-${idx}`}
                        className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-300 font-mono break-all">
                            {addr}
                          </p>
                          <p className="text-xs text-zinc-500 mt-1">
                            —
                          </p>
                        </div>
                        <div className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-600 text-zinc-200 text-sm font-medium">
                          未投票
                        </div>
                      </div>
                    ))}
                    {voteRecords.length === 0 && notVotedAddresses.length === 0 && !loadingRecords && (
                      <div className="py-8 text-center">
                        <p className="text-zinc-500">暂无投票记录</p>
                      </div>
                    )}
                  </div>
                  
                  {/* 统计摘要 */}
                  {voteRecords.length > 0 && (
                    <div className="pt-3 border-t border-zinc-800 mt-3">
                      <p className="text-xs text-zinc-500 text-center">
                        各选项统计：
                        {proposal.options.map((opt, idx) => {
                          const count = voteRecords.filter(r => r.optionIndex === idx).length;
                          const color = optionColorConfig[idx % optionColorConfig.length];
                          return (
                            <span key={idx} className={`ml-2 ${color.text}`}>
                              {opt}: {count}票
                            </span>
                          );
                        })}
                        <span className="ml-2 text-zinc-400">未投票: {notVotedAddresses.length}人</span>
                      </p>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            ) : (
              <p className="text-xs text-zinc-600 text-center flex items-center justify-center gap-1">
                <EyeOff className="w-3 h-3" /> 投票详情未公开
              </p>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2 pt-2">
          {/* 状态推进按钮 - Created → Registration */}
          {proposal.status === VotingState.Created && canAdvanceState && (
            <Button 
              onClick={() => onStartRegistration(proposal.id)}
              disabled={!wallet.isConnected || !canStartRegistration}
              className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
              title={proposal.autoAdvance && !canStartRegistration ? "未到开始时间" : undefined}
            >
              {proposal.autoAdvance ? "推进到注册" : "开始注册"}
              {proposal.autoAdvance && !canStartRegistration && " (未到时间)"}
            </Button>
          )}

          {/* 注册阶段按钮 */}
          {proposal.status === VotingState.Registration && (
            <>
              <Button 
                onClick={() => onRegister(proposal.id)}
                disabled={!wallet.isConnected || proposal.isRegistered}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
              >
                {proposal.isRegistered ? "已注册" : "注册投票"}
              </Button>
              {canAdvanceState && (
                <Button 
                  onClick={() => onStartVoting(proposal.id)}
                  disabled={!wallet.isConnected || !canStartVoting}
                  className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
                  title={proposal.autoAdvance && !canStartVoting ? "未到开始时间" : undefined}
                >
                  {proposal.autoAdvance ? "推进到投票" : "开始投票"}
                  {proposal.autoAdvance && !canStartVoting && " (未到时间)"}
                </Button>
              )}
            </>
          )}

          {/* 投票阶段按钮 */}
          {proposal.status === VotingState.Voting && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    disabled={!wallet.isConnected || !proposal.isRegistered || proposal.hasVoted}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
                  >
                    {proposal.hasVoted ? "已投票" : !proposal.isRegistered ? "未注册" : "参与投票"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  <DialogHeader>
                    <DialogTitle className="text-zinc-100">{proposal.title}</DialogTitle>
                    <DialogDescription className="text-zinc-400">{proposal.description}</DialogDescription>
                  </DialogHeader>
                  <VoteDialog 
                    options={proposal.options}
                    onVote={(optionIndex) => onVote(proposal.id, optionIndex)}
                  />
                </DialogContent>
              </Dialog>
              {canAdvanceState && (
                <Button 
                  onClick={() => onStartTallying(proposal.id)}
                  disabled={!wallet.isConnected || !canStartTallying}
                  className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
                  title={proposal.autoAdvance && !canStartTallying ? "投票未结束" : undefined}
                >
                  {proposal.autoAdvance ? "推进到计票" : "结束投票"}
                  {proposal.autoAdvance && !canStartTallying && " (未到时间)"}
                </Button>
              )}
            </>
          )}

          {/* 计票阶段按钮 */}
          {proposal.status === VotingState.Tallying && canAdvanceState && (
            <Button 
              onClick={() => onRevealResult(proposal.id)}
              disabled={!wallet.isConnected}
              className="flex-1 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 disabled:opacity-50"
            >
              {proposal.autoAdvance ? "推进到完成" : "揭示结果"}
            </Button>
          )}

          {/* 已完成 */}
          {proposal.status === VotingState.Finalized && (
            <Button
              variant="outline"
              className="flex-1 border-zinc-700 hover:border-violet-500 text-zinc-100"
            >
              查看结果
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface VoteDialogProps {
  options: string[];
  onVote: (optionIndex: number) => void;
}

function VoteDialog({ options, onVote }: VoteDialogProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 支持更多选项的颜色和图标
  const optionStyles = [
    { color: "emerald", hex: "#10b981", icon: "✓" },
    { color: "rose", hex: "#f43f5e", icon: "✗" },
    { color: "blue", hex: "#3b82f6", icon: "○" },
    { color: "amber", hex: "#f59e0b", icon: "◇" },
    { color: "violet", hex: "#8b5cf6", icon: "★" },
    { color: "cyan", hex: "#06b6d4", icon: "◆" },
    { color: "pink", hex: "#ec4899", icon: "♦" },
    { color: "teal", hex: "#14b8a6", icon: "●" },
  ];

  const handleSubmitVote = async () => {
    if (selected === null) return;
    setIsSubmitting(true);
    setStep(2);
    
    // 模拟生成证明的过程
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 调用投票回调
    onVote(selected);
    setStep(3);
  };

  return (
    <div className="space-y-6 py-4">
      {step === 1 && (
        <>
          <div className={`space-y-3 ${options.length > 4 ? 'max-h-80 overflow-y-auto pr-2' : ''}`}>
            {options.map((option, index) => {
              const style = optionStyles[index % optionStyles.length];
              const isSelected = selected === index;
              
              return (
                <button
                  key={index}
                  onClick={() => setSelected(index)}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? "border-2"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                  style={{
                    borderColor: isSelected ? style.hex : undefined,
                    backgroundColor: isSelected ? `${style.hex}1a` : undefined,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                      style={{
                        backgroundColor: isSelected ? style.hex : "#27272a"
                      }}
                    >
                      {style.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-100 truncate">{option}</p>
                      <p className="text-sm text-zinc-400">选项 {index + 1}</p>
                    </div>
                    {isSelected && (
                      <div className="shrink-0">
                        <svg className="w-5 h-5" style={{ color: style.hex }} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
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
            onClick={handleSubmitVote}
            disabled={selected === null || isSubmitting}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
          >
            确认投票
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
            <p className="font-semibold text-zinc-100">正在提交投票...</p>
            <p className="text-sm text-zinc-400 mt-1">
              正在生成证明并提交到区块链
            </p>
          </div>
          <Progress value={66} className="h-2" />
          <div className="text-xs space-y-1">
            <p className="text-emerald-400">✓ 验证选民身份</p>
            <p className="text-emerald-400">✓ 检查投票资格</p>
            <p className="text-violet-400">○ 提交投票中...</p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center space-y-6 py-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center">
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
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-zinc-100">投票成功！</p>
            <p className="text-sm text-zinc-400 mt-1">
              您的投票已成功提交
            </p>
          </div>
          <div className="text-xs space-y-1">
            <p className="text-emerald-400">✓ 投票已记录</p>
            <p className="text-emerald-400">✓ 防重复投票已生效</p>
          </div>
        </div>
      )}
    </div>
  );
}

// 创建提案时需要的时间配置
interface CreateProposalData {
  title: string;
  description: string;
  options: string[];
  status: VotingState;
  endTime: string;
  privacy: PrivacyLevel;
  rule: VotingRule;
  registrationStart: number;
  registrationEnd: number;
  votingStart: number;
  votingEnd: number;
  autoAdvance: boolean;  // 是否自动推进
  visibilityBitmap: number;  // 可见性配置位图
  enableWhitelist: boolean;  // 是否启用白名单
  whitelist: string[];  // 白名单地址列表
}

interface CreateProposalCardProps {
  wallet: WalletState;
  onCreateProposal: (proposal: CreateProposalData) => Promise<void>;
  showToast: (type: "success" | "error" | "warning" | "info", title: string, description?: string) => void;
}

function CreateProposalCard({ wallet, onCreateProposal, showToast }: CreateProposalCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 表单状态
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["赞成", "反对"]);
  const [rule, setRule] = useState<number>(VotingRule.SimpleMajority);
  const [privacy, setPrivacy] = useState<number>(PrivacyLevel.Public);
  const [registrationRule, setRegistrationRule] = useState<number>(0); // 0=开放, 1=审核, 2=NFT, 3=Token
  const [enableWhitelist, setEnableWhitelist] = useState(false); // 是否启用白名单
  const [whitelist, setWhitelist] = useState<string[]>([]); // 白名单地址列表
  const [whitelistInput, setWhitelistInput] = useState(""); // 白名单输入框
  // 信息公开对象：0=不公开, 1=仅创建者, 2=仅参与者, 3=所有人
  const [voteCountsVisibility, setVoteCountsVisibility] = useState<number>(1);
  const [voteDetailsVisibility, setVoteDetailsVisibility] = useState<number>(1);
  const [voterListVisibility, setVoterListVisibility] = useState<number>(1);
  const [resultVisibility, setResultVisibility] = useState<number>(3);
  const [progressVisibility, setProgressVisibility] = useState<number>(1);

  // 可见性配置 - 统一定义
  const visibilityOptions = [
    { value: 0, label: "不公开", icon: EyeOff },
    { value: 1, label: "创建者", icon: Crown },
    { value: 2, label: "参与者", icon: Users },
    { value: 3, label: "所有人", icon: Globe },
  ];

  const visibilitySettings = [
    { key: "voteCounts", label: "实时票数", value: voteCountsVisibility, setter: setVoteCountsVisibility },
    { key: "voteDetails", label: "投票内容", value: voteDetailsVisibility, setter: setVoteDetailsVisibility },
    { key: "voterList", label: "选民列表", value: voterListVisibility, setter: setVoterListVisibility },
    { key: "progress", label: "投票进度", value: progressVisibility, setter: setProgressVisibility },
    { key: "result", label: "最终结果", value: resultVisibility, setter: setResultVisibility },
  ];
  
  // 时间配置（单位：分钟）
  const [registrationDelay, setRegistrationDelay] = useState(1);     // 注册开始延迟（分钟）
  const [registrationDuration, setRegistrationDuration] = useState(5); // 注册持续时长（分钟）
  const [votingDuration, setVotingDuration] = useState(60);          // 投票持续时长（分钟）
  const [autoAdvance, setAutoAdvance] = useState(true);              // 推进模式：true=自动，false=手动

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setOptions(["赞成", "反对"]);
    setRule(VotingRule.SimpleMajority);
    setPrivacy(PrivacyLevel.Public);
    setRegistrationRule(0);
    setEnableWhitelist(false);
    setWhitelist([]);
    setWhitelistInput("");
    setVoteCountsVisibility(1);
    setVoteDetailsVisibility(1);
    setVoterListVisibility(1);
    setResultVisibility(3);
    setProgressVisibility(1);
    setRegistrationDelay(1);
    setRegistrationDuration(5);
    setVotingDuration(60);
    setAutoAdvance(true);
    setStep(1);
  };

  // 处理 Enter 键跳转到下一步
  const handleKeyDown = (e: React.KeyboardEvent, currentStep: number, canProceed: boolean) => {
    // 如果是 textarea，Shift+Enter 换行，只有纯 Enter 才触发下一步
    if (e.target instanceof HTMLTextAreaElement && !e.shiftKey) {
      if (e.key === "Enter" && canProceed) {
        e.preventDefault();
        if (currentStep < 3) {
          setStep(currentStep + 1);
        }
      }
    } else if (e.target instanceof HTMLInputElement) {
      if (e.key === "Enter" && canProceed) {
        e.preventDefault();
        if (currentStep < 3) {
          setStep(currentStep + 1);
        }
      }
    }
  };

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = async () => {
    if (!wallet.isConnected) {
      showToast("warning", "请先连接钱包");
      return;
    }

    setIsSubmitting(true);

    // 计算时间（转换为秒）
    const now = Math.floor(Date.now() / 1000);
    const regStart = now + registrationDelay * 60;
    const regEnd = regStart + registrationDuration * 60;
    const voteStart = regEnd;
    const voteEnd = voteStart + votingDuration * 60;

    // 将可见性设置编码为位图
    const visibilityBitmap = encodeVisibilityBitmap({
      voteCounts: voteCountsVisibility as VisibilityLevel,
      voteDetails: voteDetailsVisibility as VisibilityLevel,
      voterList: voterListVisibility as VisibilityLevel,
      progress: progressVisibility as VisibilityLevel,
      result: resultVisibility as VisibilityLevel,
    });

    const newProposal: CreateProposalData = {
      title,
      description,
      options,
      status: VotingState.Registration,
      endTime: new Date(voteEnd * 1000).toISOString(),
      privacy: privacy as PrivacyLevel,
      rule: rule as VotingRule,
      registrationStart: regStart,
      registrationEnd: regEnd,
      votingStart: voteStart,
      votingEnd: voteEnd,
      autoAdvance,
      visibilityBitmap,
      enableWhitelist,
      whitelist,
    };

    console.log("开始创建投票，参数:", newProposal);
    
    try {
      await onCreateProposal(newProposal);
    } catch (err) {
      console.error("创建投票出错:", err);
    } finally {
      setIsSubmitting(false);
      setIsOpen(false);
      resetForm();
    }
  };

  return (
    <>
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
          <Button 
            onClick={() => setIsOpen(true)}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            开始创建
          </Button>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-zinc-100 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm">
                {step}
              </span>
              {step === 1 ? "基本信息" : step === 2 ? "投票选项" : "规则配置"}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {step === 1 ? "填写提案的标题和描述" : step === 2 ? "设置投票选项" : "配置投票规则和隐私设置"}
            </DialogDescription>
          </DialogHeader>

          {/* 步骤指示器 */}
          <div className="flex items-center gap-2 py-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  s <= step ? "bg-gradient-to-r from-violet-500 to-fuchsia-500" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>

          <div className="space-y-4 py-4">
            {/* Step 1: 基本信息 */}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">提案标题 *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 1, !!(title.trim() && description.trim()))}
                    placeholder="例如：社区资金分配提案"
                    className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-zinc-300">提案描述 *</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 1, !!(title.trim() && description.trim()))}
                    placeholder="详细描述提案内容（Shift+Enter 换行，Enter 下一步）"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none transition-colors resize-none"
                  />
                </div>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!title.trim() || !description.trim()}
                  className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
                >
                  下一步
                </Button>
              </>
            )}

            {/* Step 2: 投票选项 */}
            {step === 2 && (
              <>
                {/* 预设模式选择 */}
                <div className="space-y-3">
                  <label className="text-sm text-zinc-300">选项模板</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setOptions(["赞成", "反对"])}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setOptions(["赞成", "反对"]);
                          setStep(3);
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        options.length === 2 && options[0] === "赞成" && options[1] === "反对"
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm font-medium text-zinc-200">赞成/反对</span>
                      </div>
                      <p className="text-xs text-zinc-500">适用于简单的是否决策（Enter 直接下一步）</p>
                    </button>
                    <button
                      onClick={() => setOptions(["", ""])}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        options.some(o => o === "") || (options.length === 2 && options[0] !== "赞成")
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-sm font-medium text-zinc-200">自定义</span>
                      </div>
                      <p className="text-xs text-zinc-500">自由设置多个选项</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm text-zinc-300">投票选项 (2-6个)</label>
                  {options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-sm text-zinc-400">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={option}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 2, !options.some(o => !o.trim()))}
                        placeholder={`选项 ${index + 1}`}
                        className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none transition-colors"
                      />
                      {options.length > 2 && (
                        <button
                          onClick={() => handleRemoveOption(index)}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 flex items-center justify-center transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 6 && (
                    <button
                      onClick={handleAddOption}
                      className="w-full py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-violet-500 hover:text-violet-400 transition-colors"
                    >
                      + 添加选项
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-zinc-300"
                  >
                    上一步
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={options.some(o => !o.trim())}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
                  >
                    下一步
                  </Button>
                </div>
              </>
            )}

            {/* Step 3: 规则配置 */}
            {step === 3 && (
              <>
                <div className="space-y-4">
                  {/* 投票规则和隐私级别 - 并排布局 */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* 投票规则 */}
                    <div className="space-y-2">
                      <label className="text-sm text-zinc-300">投票规则</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: VotingRule.SimpleMajority, label: "简单多数", desc: "票数最多者胜出" },
                          { value: VotingRule.Weighted, label: "加权投票", desc: "按Token数量加权" },
                          { value: VotingRule.Quadratic, label: "二次方投票", desc: "成本=票数²" },
                          { value: VotingRule.RankedChoice, label: "排序选择", desc: "按偏好排序" },
                        ].map((r) => (
                          <button
                            key={r.value}
                            onClick={() => setRule(r.value)}
                            className={`p-2 rounded-lg border-2 text-left transition-all ${
                              rule === r.value
                                ? "border-violet-500 bg-violet-500/10"
                                : "border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <p className="font-medium text-sm text-zinc-100">{r.label}</p>
                            <p className="text-xs text-zinc-500">{r.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 隐私级别 */}
                    <div className="space-y-2">
                      <label className="text-sm text-zinc-300">隐私级别</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: PrivacyLevel.Public, label: "公开投票", icon: Eye },
                          { value: PrivacyLevel.Anonymous, label: "匿名投票", icon: EyeOff },
                          { value: PrivacyLevel.Encrypted, label: "加密投票", icon: Lock },
                          { value: PrivacyLevel.FullPrivacy, label: "完全隐私", icon: ShieldCheck },
                        ].map((p) => (
                          <button
                            key={p.value}
                            onClick={() => setPrivacy(p.value)}
                            className={`p-2 rounded-lg border-2 text-left transition-all ${
                              privacy === p.value
                                ? "border-fuchsia-500 bg-fuchsia-500/10"
                                : "border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <p.icon className="w-4 h-4 text-zinc-300" />
                            <p className="font-medium text-sm text-zinc-100 mt-1">{p.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 信息公开设置 - 配置驱动 */}
                  <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
                    <p className="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4" /> 信息公开设置
                    </p>
                    
                    {/* 表头 - 使用 visibilityOptions 配置 */}
                    <div className="grid grid-cols-5 gap-2 mb-2 text-center">
                      <div className="text-xs text-zinc-500">信息类型</div>
                      {visibilityOptions.map((opt) => (
                        <div key={opt.value} className="text-xs text-zinc-500 flex items-center justify-center gap-1">
                          <opt.icon className="w-3 h-3" /> {opt.label}
                        </div>
                      ))}
                    </div>

                    {/* 可见性设置行 - 使用 visibilitySettings 配置 */}
                    <div className="space-y-2">
                      {visibilitySettings.map((item) => (
                        <div key={item.key} className="grid grid-cols-5 gap-2 items-center">
                          <div className="text-sm text-zinc-300">{item.label}</div>
                          {visibilityOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => item.setter(opt.value)}
                              className={`p-2 rounded-lg border transition-all ${
                                item.value === opt.value
                                  ? "border-emerald-500 bg-emerald-500/20"
                                  : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
                              }`}
                            >
                              <div className={`w-3 h-3 mx-auto rounded-full ${
                                item.value === opt.value ? "bg-emerald-500" : "bg-zinc-600"
                              }`} />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 注册规则 */}
                  <div className="space-y-2">
                    <label className="text-sm text-zinc-300">注册规则</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: 0, label: "开放注册", desc: "任何人都可注册", icon: Globe },
                        { value: 1, label: "创建者审核", desc: "需创建者批准", icon: UserCheck },
                        { value: 2, label: "NFT 持有者", desc: "持有指定 NFT", icon: ImageIcon },
                        { value: 3, label: "Token 持有者", desc: "持有指定 Token", icon: Coins },
                      ].map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setRegistrationRule(r.value)}
                          className={`p-2 rounded-lg border-2 text-left transition-all ${
                            registrationRule === r.value
                              ? "border-cyan-500 bg-cyan-500/10"
                              : "border-zinc-800 hover:border-zinc-700"
                          }`}
                        >
                          <r.icon className="w-4 h-4 text-zinc-300" />
                          <p className="font-medium text-sm text-zinc-100 mt-1">{r.label}</p>
                          <p className="text-xs text-zinc-500">{r.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 白名单开关与配置 - 独立于注册规则 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-zinc-300 flex items-center gap-2">
                        <Users className="w-4 h-4" /> 白名单限制
                      </label>
                      <button
                        onClick={() => setEnableWhitelist(!enableWhitelist)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          enableWhitelist ? "bg-cyan-500" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            enableWhitelist ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">
                      启用后，白名单内地址可无视注册规则参与投票
                    </p>
                  </div>

                  {/* 白名单地址导入 - 启用白名单时显示 */}
                  {enableWhitelist && (
                    <div className="space-y-3 p-3 rounded-xl bg-zinc-800/50 border border-cyan-500/30">
                      <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Upload className="w-4 h-4" /> 白名单地址导入
                      </p>
                      
                      {/* 输入区域 */}
                      <div className="space-y-2">
                        <textarea
                          value={whitelistInput}
                          onChange={(e) => setWhitelistInput(e.target.value)}
                          placeholder="输入钱包地址，每行一个或用逗号分隔&#10;例如：&#10;0x1234...&#10;0x5678..."
                          rows={4}
                          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none transition-colors resize-none text-sm font-mono"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              const addresses = whitelistInput
                                .split(/[\n,]/)
                                .map(a => a.trim())
                                .filter(a => a.length > 0 && a.startsWith("0x"));
                              const uniqueAddresses = [...new Set([...whitelist, ...addresses])];
                              setWhitelist(uniqueAddresses);
                              setWhitelistInput("");
                            }}
                            disabled={!whitelistInput.trim()}
                            className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                          >
                            添加地址
                          </Button>
                          <Button
                            onClick={() => setWhitelist([])}
                            disabled={whitelist.length === 0}
                            variant="outline"
                            className="border-zinc-700 text-zinc-400 hover:text-rose-400 hover:border-rose-500 disabled:opacity-50"
                          >
                            清空
                          </Button>
                        </div>
                      </div>

                      {/* 已添加的地址列表 */}
                      {whitelist.length > 0 && (
                        <div className="space-y-2">
                          <p className={`text-xs ${whitelist.length > 200 ? "text-rose-400" : "text-zinc-400"}`}>
                            已添加 {whitelist.length} 个地址
                            {whitelist.length > 200 && " (超过 200 限制，请减少)"}
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                            {whitelist.map((addr, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 group"
                              >
                                <span className="text-xs font-mono text-zinc-300 truncate flex-1">
                                  {addr.slice(0, 10)}...{addr.slice(-8)}
                                </span>
                                <button
                                  onClick={() => setWhitelist(whitelist.filter((_, i) => i !== idx))}
                                  className="ml-2 p-1 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 推进模式 */}
                  <div className="space-y-2">
                    <label className="text-sm text-zinc-300">状态推进模式</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setAutoAdvance(true)}
                        className={`p-2 rounded-lg border-2 text-left transition-all ${
                          autoAdvance
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <p className="font-medium text-sm text-zinc-100">自动推进</p>
                        <p className="text-xs text-zinc-500">到达时间自动切换状态</p>
                      </button>
                      <button
                        onClick={() => setAutoAdvance(false)}
                        className={`p-2 rounded-lg border-2 text-left transition-all ${
                          !autoAdvance
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <p className="font-medium text-sm text-zinc-100">手动推进</p>
                        <p className="text-xs text-zinc-500">创建者随时可推进</p>
                      </button>
                    </div>
                  </div>

                  {/* 时间配置 - 仅自动推进模式显示 */}
                  {autoAdvance && (
                    <div className="space-y-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
                      <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Timer className="w-4 h-4" /> 时间配置（单位：分钟）
                      </p>
                      
                      <div className="grid grid-cols-3 gap-3">
                        {/* 注册开始延迟 */}
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">注册开始延迟</label>
                          <input
                            type="number"
                            min="1"
                            value={registrationDelay}
                            onChange={(e) => setRegistrationDelay(Math.max(1, Number(e.target.value)))}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-amber-500 focus:outline-none"
                          />
                        </div>

                        {/* 注册持续时长 */}
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">注册阶段时长</label>
                          <input
                            type="number"
                            min="1"
                            value={registrationDuration}
                            onChange={(e) => setRegistrationDuration(Math.max(1, Number(e.target.value)))}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-emerald-500 focus:outline-none"
                          />
                        </div>

                        {/* 投票持续时长 */}
                        <div className="space-y-1">
                          <label className="text-xs text-zinc-400">投票阶段时长</label>
                          <input
                            type="number"
                            min="1"
                            value={votingDuration}
                            onChange={(e) => setVotingDuration(Math.max(1, Number(e.target.value)))}
                            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-violet-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* 时间预览 */}
                      <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-700 space-y-1">
                        <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 注册: 创建后 <span className="text-amber-400">{registrationDelay}</span> 分钟开始, 持续 <span className="text-emerald-400">{registrationDuration}</span> 分钟</p>
                        <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 投票: 创建后 <span className="text-violet-400">{registrationDelay + registrationDuration}</span> 分钟开始, 持续 <span className="text-violet-400">{votingDuration}</span> 分钟</p>
                      </div>
                    </div>
                  )}

                  {/* 手动推进模式提示 */}
                  {!autoAdvance && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <p className="text-sm text-amber-400 flex items-center gap-2">
                        <Crown className="w-4 h-4" /> 手动推进模式
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">
                        创建后，您可以随时点击按钮推进投票状态，无需等待时间
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setStep(2)}
                    variant="outline"
                    className="flex-1 border-zinc-700 text-zinc-300"
                  >
                    上一步
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !wallet.isConnected}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        创建中...
                      </>
                    ) : (
                      "创建提案"
                    )}
                  </Button>
                </div>

                {!wallet.isConnected && (
                  <p className="text-sm text-amber-400 text-center">
                    请先连接钱包以创建提案
                  </p>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TechStack() {
  const techs = [
    {
      name: "Semaphore",
      desc: "零知识身份证明",
      icon: Shield,
    },
    {
      name: "Paillier",
      desc: "加法同态加密",
      icon: Hash,
    },
    {
      name: "Merkle Tree",
      desc: "成员资格证明",
      icon: TreeDeciduous,
    },
    {
      name: "阈值解密",
      desc: "t-of-n 委员会协作",
      icon: KeyRound,
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
            <tech.icon className="w-6 h-6 text-violet-400" />
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
  const votingFactory = useVotingFactory(wallet.chainId);
  const statisticsCenter = useStatisticsCenter(wallet.chainId);
  const { addToast } = useToast();
  
  const [proposals, setProposals] = useState<LocalProposal[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // 用户统计数据（从 StatisticsCenter 获取）
  const [userStats, setUserStats] = useState<{
    votingsCreated: number;
    votingsParticipated: number;
    votesCast: number;
  } | null>(null);

  // 从合约加载提案列表
  useEffect(() => {
    let isMounted = true;
    
    const loadProposals = async () => {
      if (!wallet.chainId) return;
      
      if (!votingFactory.isContractDeployed()) {
        if (isMounted) setLoadError("合约尚未部署到当前网络");
        return;
      }

      if (isMounted) {
        setIsLoadingProposals(true);
        setLoadError(null);
      }

      try {
        const votings = await votingFactory.getAllVotings();
        
        // 如果用户已连接，获取每个提案的用户状态
        const localProposals: LocalProposal[] = [];
        for (const voting of votings) {
          let userStatus = { registered: false, voted: false };
          if (wallet.isConnected && wallet.address) {
            userStatus = await votingFactory.getUserVotingStatus(voting.id, wallet.address);
          }
          localProposals.push(convertToLocalProposal(voting, userStatus));
        }
        
        if (isMounted) setProposals(localProposals);
      } catch (err) {
        console.error("加载提案失败:", err);
        if (isMounted) setLoadError("加载提案失败，请确保已连接到正确的网络");
      } finally {
        if (isMounted) setIsLoadingProposals(false);
      }
    };

    loadProposals();
    
    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.chainId, wallet.isConnected, wallet.address, refreshTrigger]);

  // 刷新提案列表
  const refreshProposals = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // 从 StatisticsCenter 获取用户统计
  useEffect(() => {
    const loadUserStats = async () => {
      if (!wallet.isConnected || !wallet.address) {
        setUserStats(null);
        return;
      }
      
      if (!statisticsCenter.isContractDeployed()) {
        // 统计中心未部署，回退到本地计算
        return;
      }

      try {
        const stats = await statisticsCenter.fetchUserStats(wallet.address);
        if (stats) {
          setUserStats({
            votingsCreated: stats.votingsCreated,
            votingsParticipated: stats.votingsParticipated,
            votesCast: stats.votesCast,
          });
        }
      } catch (err) {
        console.error("获取用户统计失败:", err);
      }
    };

    loadUserStats();
  }, [wallet.isConnected, wallet.address, statisticsCenter, refreshTrigger]);

  // 处理注册 - 调用真实合约
  const handleRegister = useCallback(async (proposalId: number) => {
    console.log("handleRegister: 点击注册, proposalId:", proposalId);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    console.log("handleRegister: 调用 votingFactory.registerVoter");
    const success = await votingFactory.registerVoter(proposalId);
    console.log("handleRegister: 结果:", success, "error:", votingFactory.error);
    if (success) {
      addToast("success", "注册成功", "您已成功注册为投票人");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "注册失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 处理投票 - 调用真实合约
  const handleVote = useCallback(async (proposalId: number, optionIndex: number) => {
    console.log("handleVote: 点击投票, proposalId:", proposalId, "optionIndex:", optionIndex);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    console.log("handleVote: 调用 votingFactory.castVote");
    const success = await votingFactory.castVote(proposalId, optionIndex);
    console.log("handleVote: 结果:", success, "error:", votingFactory.error);
    if (success) {
      addToast("success", "投票成功", "您的投票已提交");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "投票失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 开始注册阶段
  const handleStartRegistration = useCallback(async (proposalId: number) => {
    console.log("handleStartRegistration: 点击开始注册, proposalId:", proposalId);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    console.log("handleStartRegistration: 调用 votingFactory.startRegistration");
    const success = await votingFactory.startRegistration(proposalId);
    console.log("handleStartRegistration: 结果:", success);
    if (success) {
      addToast("success", "已开始注册", "投票已进入注册阶段");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "操作失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 开始投票阶段
  const handleStartVoting = useCallback(async (proposalId: number) => {
    console.log("handleStartVoting: 点击开始投票, proposalId:", proposalId);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    console.log("handleStartVoting: 调用 votingFactory.startVoting");
    const success = await votingFactory.startVoting(proposalId);
    console.log("handleStartVoting: 结果:", success, "error:", votingFactory.error);
    if (success) {
      addToast("success", "已开始投票", "投票已进入投票阶段");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "操作失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 开始计票阶段
  const handleStartTallying = useCallback(async (proposalId: number) => {
    console.log("handleStartTallying: 点击结束投票, proposalId:", proposalId);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    console.log("handleStartTallying: 调用 votingFactory.startTallying");
    const success = await votingFactory.startTallying(proposalId);
    console.log("handleStartTallying: 结果:", success, "error:", votingFactory.error);
    if (success) {
      addToast("success", "已结束投票", "投票已进入计票阶段");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "操作失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 揭示结果
  const handleRevealResult = useCallback(async (proposalId: number) => {
    console.log("handleRevealResult: 点击揭示结果, proposalId:", proposalId);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    console.log("handleRevealResult: 调用 votingFactory.revealResult");
    const success = await votingFactory.revealResult(proposalId);
    console.log("handleRevealResult: 结果:", success, "error:", votingFactory.error);
    if (success) {
      addToast("success", "结果已揭示", "投票结果已公布");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "操作失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 加载投票记录
  const handleLoadVoteRecords = useCallback(async (proposalId: number): Promise<VoteRecord[] | null> => {
    const result = await votingFactory.getVoteRecords(proposalId);
    if (!result) return null;
    
    const records: VoteRecord[] = [];
    for (let i = 0; i < result.voters.length; i++) {
      records.push({
        voter: result.voters[i],
        optionIndex: result.optionIndexes[i],
        timestamp: result.timestamps[i],
      });
    }
    return records;
  }, [votingFactory]);

  // 加载已注册选民列表（用于投票详情中展示未投票的人）
  const handleLoadRegisteredVoters = useCallback(async (proposalId: number): Promise<string[] | null> => {
    const list = await votingFactory.getRegisteredVoters(proposalId);
    return list && list.length > 0 ? list : null;
  }, [votingFactory]);

  // 处理创建提案 - 调用真实合约
  const handleCreateProposal = useCallback(async (proposalData: CreateProposalData) => {
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }

    // 使用用户配置的时间
    const votingId = await votingFactory.createVoting({
      title: proposalData.title,
      description: proposalData.description,
      options: proposalData.options,
      votingRule: proposalData.rule,
      privacyLevel: proposalData.privacy,
      registrationStart: proposalData.registrationStart,
      registrationEnd: proposalData.registrationEnd,
      votingStart: proposalData.votingStart,
      votingEnd: proposalData.votingEnd,
      quorum: 0, // 无法定人数要求
      autoAdvance: proposalData.autoAdvance,
      visibilityBitmap: proposalData.visibilityBitmap,
      enableWhitelist: proposalData.enableWhitelist,
      whitelist: proposalData.whitelist,
    });

    if (votingId !== null) {
      console.log("投票创建成功，ID:", votingId);
      
      // 自动推进模式：自动开始注册阶段
      if (proposalData.autoAdvance) {
        try {
          await votingFactory.startRegistration(votingId);
          console.log("自动推进到注册阶段");
        } catch (err) {
          console.log("自动推进注册阶段失败（可能时间未到）:", err);
        }
      }
      
      // 刷新提案列表
      refreshProposals();
      addToast("success", "投票创建成功", `投票 #${votingId} 已创建`);
    } else if (votingFactory.error) {
      console.error("创建投票失败:", votingFactory.error);
      addToast("error", "创建投票失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

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
        <StatsCards 
          globalStats={statisticsCenter.globalStats}
          privacyStats={statisticsCenter.privacyStats}
          isLoading={statisticsCenter.isLoading}
        />

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
                {/* 加载状态 */}
                {isLoadingProposals && (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full border-4 border-violet-500 border-t-transparent animate-spin mb-4" />
                      <p className="text-zinc-400">正在从链上加载提案...</p>
                    </CardContent>
                  </Card>
                )}

                {/* 错误状态 */}
                {loadError && !isLoadingProposals && (
                  <Card className="bg-zinc-900/50 border-rose-500/30">
                    <CardContent className="py-8 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-rose-400 mb-2">{loadError}</p>
                      <Button onClick={refreshProposals} variant="outline" size="sm" className="border-rose-500/50 text-rose-400 hover:bg-rose-500/10">
                        重试
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* 空状态 */}
                {!isLoadingProposals && !loadError && proposals.length === 0 && (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-300">暂无提案</h3>
                      <p className="text-sm text-zinc-500 mt-1">创建第一个提案开始投票吧！</p>
                    </CardContent>
                  </Card>
                )}

                {/* 提案列表 */}
                {!isLoadingProposals && !loadError && proposals.map((proposal) => (
                  <ProposalCard 
                    key={proposal.id} 
                    proposal={proposal} 
                    wallet={wallet}
                    onRegister={handleRegister}
                    onVote={handleVote}
                    onStartRegistration={handleStartRegistration}
                    onStartVoting={handleStartVoting}
                    onStartTallying={handleStartTallying}
                    onRevealResult={handleRevealResult}
                    onLoadVoteRecords={handleLoadVoteRecords}
                        onLoadRegisteredVoters={handleLoadRegisteredVoters}
                  />
                ))}
              </div>

              {/* 侧边栏 */}
              <div className="space-y-4">
                <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} />
                <TechStack />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="active">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {isLoadingProposals ? (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full border-4 border-violet-500 border-t-transparent animate-spin mb-4" />
                      <p className="text-zinc-400">正在加载...</p>
                    </CardContent>
                  </Card>
                ) : proposals.filter(p => p.status === VotingState.Voting || p.status === VotingState.Registration).length === 0 ? (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <p className="text-zinc-500">暂无进行中的提案</p>
                    </CardContent>
                  </Card>
                ) : (
                  proposals
                    .filter(p => p.status === VotingState.Voting || p.status === VotingState.Registration)
                    .map((proposal) => (
                      <ProposalCard 
                        key={proposal.id} 
                        proposal={proposal} 
                        wallet={wallet}
                        onRegister={handleRegister}
                        onVote={handleVote}
                        onStartRegistration={handleStartRegistration}
                        onStartVoting={handleStartVoting}
                        onStartTallying={handleStartTallying}
                        onRevealResult={handleRevealResult}
                        onLoadVoteRecords={handleLoadVoteRecords}
                        onLoadRegisteredVoters={handleLoadRegisteredVoters}
                      />
                    ))
                )}
              </div>
              <div className="space-y-4">
                <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} />
                <TechStack />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="completed">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {isLoadingProposals ? (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <div className="w-12 h-12 mx-auto rounded-full border-4 border-violet-500 border-t-transparent animate-spin mb-4" />
                      <p className="text-zinc-400">正在加载...</p>
                    </CardContent>
                  </Card>
                ) : proposals.filter(p => p.status === VotingState.Finalized).length === 0 ? (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <p className="text-zinc-500">暂无已完成的提案</p>
                    </CardContent>
                  </Card>
                ) : (
                  proposals
                    .filter((p) => p.status === VotingState.Finalized)
                    .map((proposal) => (
                      <ProposalCard 
                        key={proposal.id} 
                        proposal={proposal} 
                        wallet={wallet}
                        onRegister={handleRegister}
                        onVote={handleVote}
                        onStartRegistration={handleStartRegistration}
                        onStartVoting={handleStartVoting}
                        onStartTallying={handleStartTallying}
                        onRevealResult={handleRevealResult}
                        onLoadVoteRecords={handleLoadVoteRecords}
                        onLoadRegisteredVoters={handleLoadRegisteredVoters}
                      />
                    ))
                )}
              </div>
              <div className="space-y-4">
                <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} />
                <TechStack />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="my">
            {wallet.isConnected ? (
              (() => {
                // 筛选我创建或参与的投票
                const myProposals = proposals.filter(p => 
                  p.creator?.toLowerCase() === wallet.address?.toLowerCase() || 
                  p.isRegistered || 
                  p.hasVoted
                );
                
                return (
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
                          {/* 统计信息 - 优先使用 StatisticsCenter 的数据 */}
                          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-zinc-800">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-violet-400">
                                {userStats?.votingsCreated ?? proposals.filter(p => p.creator?.toLowerCase() === wallet.address?.toLowerCase()).length}
                              </p>
                              <p className="text-xs text-zinc-500">创建的投票</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-emerald-400">
                                {userStats?.votingsParticipated ?? proposals.filter(p => p.isRegistered).length}
                              </p>
                              <p className="text-xs text-zinc-500">已注册</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-fuchsia-400">
                                {userStats?.votesCast ?? proposals.filter(p => p.hasVoted).length}
                              </p>
                              <p className="text-xs text-zinc-500">已投票</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* 我的投票列表 */}
                      {isLoadingProposals ? (
                        <Card className="bg-zinc-900/50 border-zinc-800">
                          <CardContent className="py-12 text-center">
                            <div className="w-12 h-12 mx-auto rounded-full border-4 border-violet-500 border-t-transparent animate-spin mb-4" />
                            <p className="text-zinc-400">正在加载...</p>
                          </CardContent>
                        </Card>
                      ) : myProposals.length === 0 ? (
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
                              您还没有创建或参与任何投票，去看看有哪些提案吧！
                            </p>
                          </CardContent>
                        </Card>
                      ) : (
                        myProposals.map((proposal) => (
                          <ProposalCard 
                            key={proposal.id} 
                            proposal={proposal} 
                            wallet={wallet}
                            onRegister={handleRegister}
                            onVote={handleVote}
                            onStartRegistration={handleStartRegistration}
                            onStartVoting={handleStartVoting}
                            onStartTallying={handleStartTallying}
                            onRevealResult={handleRevealResult}
                            onLoadVoteRecords={handleLoadVoteRecords}
                            onLoadRegisteredVoters={handleLoadRegisteredVoters}
                          />
                        ))
                      )}
                    </div>
                    <div className="space-y-4">
                      <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} />
                      <TechStack />
                    </div>
                  </div>
                );
              })()
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
              <Lock className="w-4 h-4" />
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

function AppWithProviders() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}

export default AppWithProviders;
