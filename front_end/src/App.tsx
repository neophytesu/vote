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
import { VotingState, VotingRule, PrivacyLevel, RegistrationRule } from "@/contracts/abi";
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
  RotateCcw,
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
  totalVotesCast: number;  // 独立的投票人数（来自合约，RCV 期间 voteCounts 为 0 但此值正确）
  endTime: string;
  privacy: PrivacyLevel;
  rule: VotingRule;
  isRegistered?: boolean;
  isPending?: boolean;         // 是否待审核（审核模式）
  hasVoted?: boolean;
  creator: string;           // 创建者地址
  autoAdvance: boolean;      // 是否自动推进
  registrationStart: number; // 注册开始时间
  registrationEnd: number;   // 注册结束时间
  votingStart: number;       // 投票开始时间
  votingEnd: number;         // 投票结束时间
  visibilityBitmap: number;  // 可见性配置位图
  weightGroupNames: string[];    // 加权投票：权重分组名称
  weightGroupWeights: number[];  // 加权投票：权重分组权重值
  registrationRule: RegistrationRule;  // 注册规则
  tokenContractAddress: string;  // NFT/Token 合约地址
  tokenMinBalance: number;       // 最低持有数量
  useBlockNumber?: boolean;      // 时间控制：true=用区块高度
  allowExtension?: boolean;      // 是否允许动态延长注册期/投票期
}

// 将合约数据转换为本地提案格式
function convertToLocalProposal(voting: VotingDetails, userStatus?: { registered: boolean; pending?: boolean; voted: boolean }): LocalProposal {
  return {
    id: voting.id,
    title: voting.title,
    description: voting.description,
    options: voting.options,
    status: voting.state,
    voteCounts: voting.voteCounts,
    totalVoters: voting.totalVoters,
    totalVotesCast: voting.totalVotes,
    endTime: voting.useBlockNumber ? new Date(voting.votingEnd * 12 * 1000).toISOString() : new Date(voting.votingEnd * 1000).toISOString(), // 区块模式用 ~12s/块估算
    privacy: voting.privacyLevel,
    rule: voting.votingRule,
    isRegistered: userStatus?.registered ?? false,
    isPending: userStatus?.pending ?? false,
    hasVoted: userStatus?.voted ?? false,
    creator: voting.creator,
    autoAdvance: voting.autoAdvance,
    registrationStart: voting.registrationStart,
    registrationEnd: voting.registrationEnd,
    votingStart: voting.votingStart,
    votingEnd: voting.votingEnd,
    visibilityBitmap: voting.visibilityBitmap,
    weightGroupNames: voting.weightGroupNames || [],
    weightGroupWeights: voting.weightGroupWeights || [],
    registrationRule: voting.registrationRule ?? RegistrationRule.Open,
    tokenContractAddress: voting.tokenContractAddress || "0x0000000000000000000000000000000000000000",
    tokenMinBalance: voting.tokenMinBalance || 0,
    useBlockNumber: voting.useBlockNumber ?? false,
    allowExtension: voting.allowExtension ?? true,
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
  [VotingState.Cancelled]: {
    label: "已取消",
    color: "bg-red-500/80",
    step: 0,
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

interface RankedVoteRecord {
  voter: string;
  ranking: number[];
  timestamp: number;
}

interface ProposalCardProps {
  proposal: LocalProposal;
  wallet: WalletState;
  onRegister: (proposalId: number) => void;
  onRegisterAnonymous?: (proposalId: number) => void;
  onRegisterAnonymousWeighted?: (proposalId: number, groupIndex: number) => void;
  onRegisterWeighted: (proposalId: number, groupIndex: number) => void;
  onVote: (proposalId: number, optionIndex: number) => void;
  onVoteAnonymous?: (proposalId: number, optionIndex: number) => void;
  onVoteAnonymousRanked?: (proposalId: number, rankedOptions: number[]) => void;
  onVoteAnonymousQuadratic?: (proposalId: number, optionIndexes: number[], voteAmounts: number[]) => void;
  onQuadraticVote: (proposalId: number, optionIndexes: number[], voteAmounts: number[]) => void;
  onRankedVote: (proposalId: number, rankedOptions: number[]) => void;
  onStartRegistration: (proposalId: number) => void;
  onStartVoting: (proposalId: number) => void;
  onStartTallying: (proposalId: number) => void;
  onRevealResult: (proposalId: number) => void;
  onCancelVoting?: (proposalId: number) => void;
  onExtendRegistrationEnd?: (proposalId: number, newEnd: number) => Promise<boolean>;
  onExtendVotingEnd?: (proposalId: number, newEnd: number) => Promise<boolean>;
  getBlockNumber?: () => Promise<number | null>;
  getChainTimestamp?: () => Promise<number | null>;
  onLoadVoteRecords?: (proposalId: number) => Promise<VoteRecord[] | null>;
  onLoadRankedVoteRecords?: (proposalId: number) => Promise<RankedVoteRecord[] | null>;
  onLoadRegisteredVoters?: (proposalId: number) => Promise<string[] | null>;
  onApproveRegistration?: (proposalId: number, voter: string) => void;
  onRejectRegistration?: (proposalId: number, voter: string) => void;
  onBatchApproveRegistrations?: (proposalId: number, voters: string[]) => void;
  onLoadPendingVoters?: (proposalId: number) => Promise<string[]>;
}

// 延长弹窗内容：增加时间式操作（分钟、小时、天可同时设置）
interface ExtendDialogContentProps {
  title: string;
  currentEnd: number;
  useBlockNumber?: boolean;
  extendNewValue: string;
  setExtendNewValue: (v: string) => void;
  extendAddMinutes: number;
  setExtendAddMinutes: (v: number) => void;
  extendAddHours: number;
  setExtendAddHours: (v: number) => void;
  extendAddDays: number;
  setExtendAddDays: (v: number) => void;
  extendAddBlocks: number;
  setExtendAddBlocks: (v: number) => void;
  extendLoading: boolean;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
}

function ExtendDialogContent({
  title,
  currentEnd,
  useBlockNumber,
  extendNewValue,
  setExtendNewValue,
  extendAddMinutes,
  setExtendAddMinutes,
  extendAddHours,
  setExtendAddHours,
  extendAddDays,
  setExtendAddDays,
  extendAddBlocks,
  setExtendAddBlocks,
  extendLoading,
  onConfirm,
  onClose,
}: ExtendDialogContentProps) {
  const updateExtendNewValue = (min: number, hr: number, day: number, block: number) => {
    if (useBlockNumber) {
      setExtendNewValue(String(currentEnd + block));
    } else {
      const delta = min * 60 + hr * 3600 + day * 86400;
      setExtendNewValue(String(currentEnd + delta));
    }
  };
  const applyPreset = (minutes: number, hours: number, days: number, blocks: number) => {
    if (useBlockNumber) {
      setExtendAddBlocks(blocks);
      setExtendAddMinutes(0);
      setExtendAddHours(0);
      setExtendAddDays(0);
      setExtendNewValue(String(currentEnd + blocks));
    } else {
      setExtendAddMinutes(minutes);
      setExtendAddHours(hours);
      setExtendAddDays(days);
      setExtendAddBlocks(0);
      const delta = minutes * 60 + hours * 3600 + days * 86400;
      setExtendNewValue(String(currentEnd + delta));
    }
  };
  const newVal = Number(extendNewValue);
  const isValid = !isNaN(newVal) && newVal > currentEnd;
  const presetTimestamp = useBlockNumber
    ? [
        { label: "20 区块", minutes: 0, hours: 0, days: 0, blocks: 20 },
        { label: "50 区块", minutes: 0, hours: 0, days: 0, blocks: 50 },
        { label: "100 区块", minutes: 0, hours: 0, days: 0, blocks: 100 },
      ]
    : [
        { label: "15 分钟", minutes: 15, hours: 0, days: 0, blocks: 0 },
        { label: "30 分钟", minutes: 30, hours: 0, days: 0, blocks: 0 },
        { label: "1 小时", minutes: 0, hours: 1, days: 0, blocks: 0 },
        { label: "6 小时", minutes: 0, hours: 6, days: 0, blocks: 0 },
        { label: "1 天", minutes: 0, hours: 0, days: 1, blocks: 0 },
        { label: "7 天", minutes: 0, hours: 0, days: 7, blocks: 0 },
      ];
  const preview = useBlockNumber
    ? `新区块号: ${extendNewValue || "—"}`
    : extendNewValue
      ? new Date(newVal * 1000).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })
      : "—";

  return (
    <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-sm">
      <DialogHeader>
        <DialogTitle className="text-zinc-100">{title}</DialogTitle>
        <DialogDescription className="text-zinc-400">
          {useBlockNumber ? "延长区块数" : "延长分钟、小时、天，可同时设置多者"}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">当前截止: {useBlockNumber ? `区块 ${currentEnd}` : new Date(currentEnd * 1000).toLocaleString("zh-CN")}</p>
        <div className="flex flex-wrap gap-2">
          {presetTimestamp.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.minutes, p.hours, p.days, p.blocks)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-600 hover:border-amber-500 text-zinc-200 text-sm"
            >
              {p.label}
            </button>
          ))}
        </div>
        {useBlockNumber ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">延长</span>
            <input
              type="number"
              min="1"
              value={extendAddBlocks}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value));
                setExtendAddBlocks(v);
                setExtendNewValue(String(currentEnd + v));
              }}
              className="w-24 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm"
            />
            <span className="text-sm text-zinc-400">区块</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-400 w-full">自定义:</span>
            <div className="flex items-center gap-1">
              <input type="number" min="0" value={extendAddMinutes} onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setExtendAddMinutes(v); updateExtendNewValue(v, extendAddHours, extendAddDays, extendAddBlocks); }} className="w-16 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm text-center" />
              <span className="text-xs text-zinc-500">分钟</span>
            </div>
            <div className="flex items-center gap-1">
              <input type="number" min="0" value={extendAddHours} onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setExtendAddHours(v); updateExtendNewValue(extendAddMinutes, v, extendAddDays, extendAddBlocks); }} className="w-16 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm text-center" />
              <span className="text-xs text-zinc-500">小时</span>
            </div>
            <div className="flex items-center gap-1">
              <input type="number" min="0" value={extendAddDays} onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setExtendAddDays(v); updateExtendNewValue(extendAddMinutes, extendAddHours, v, extendAddBlocks); }} className="w-16 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm text-center" />
              <span className="text-xs text-zinc-500">天</span>
            </div>
          </div>
        )}
        <p className="text-xs text-zinc-500">新的截止: {preview}</p>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button
          disabled={extendLoading || !isValid}
          onClick={async () => {
            const ok = await onConfirm();
            if (ok) onClose();
          }}
          className="bg-amber-500 hover:bg-amber-600"
        >
          {extendLoading ? "处理中..." : "确认延长"}
        </Button>
      </div>
    </DialogContent>
  );
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

function ProposalCard({ proposal, wallet, onRegister, onRegisterAnonymous, onRegisterAnonymousWeighted, onRegisterWeighted, onVote, onVoteAnonymous, onVoteAnonymousRanked, onVoteAnonymousQuadratic, onQuadraticVote, onRankedVote, onStartRegistration, onStartVoting, onStartTallying, onRevealResult, onCancelVoting, onExtendRegistrationEnd, onExtendVotingEnd, getBlockNumber, getChainTimestamp, onLoadVoteRecords, onLoadRankedVoteRecords, onLoadRegisteredVoters, onApproveRegistration, onRejectRegistration, onBatchApproveRegistrations, onLoadPendingVoters }: ProposalCardProps) {
  const [showVoteDetails, setShowVoteDetails] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [showVoterListDialog, setShowVoterListDialog] = useState(false);
  const [showWeightGroupDialog, setShowWeightGroupDialog] = useState(false);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  const [showExtendRegDialog, setShowExtendRegDialog] = useState(false);
  const [showExtendVoteDialog, setShowExtendVoteDialog] = useState(false);
  const [extendNewValue, setExtendNewValue] = useState("");
  const [extendAddMinutes, setExtendAddMinutes] = useState(0);
  const [extendAddHours, setExtendAddHours] = useState(1);
  const [extendAddDays, setExtendAddDays] = useState(0);
  const [extendAddBlocks, setExtendAddBlocks] = useState(20);
  const [extendLoading, setExtendLoading] = useState(false);
  const [pendingVoters, setPendingVoters] = useState<string[]>([]);
  const [voterListAddresses, setVoterListAddresses] = useState<string[]>([]);
  const [loadingVoterList, setLoadingVoterList] = useState(false);
  const [voteRecords, setVoteRecords] = useState<VoteRecord[]>([]);
  const [rankedVoteRecords, setRankedVoteRecords] = useState<RankedVoteRecord[]>([]);
  const [notVotedAddresses, setNotVotedAddresses] = useState<string[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [chainTimestamp, setChainTimestamp] = useState<number | null>(null);
  const status = statusConfig[proposal.status];

  // 轮询链上时间/区块，以正确计算 canStart*（合约用 block.number 或 block.timestamp）
  useEffect(() => {
    const fetch = async () => {
      if (proposal.useBlockNumber && getBlockNumber) {
        const block = await getBlockNumber();
        if (block != null) setCurrentBlock(block);
      } else if (!proposal.useBlockNumber && getChainTimestamp) {
        const ts = await getChainTimestamp();
        if (ts != null) setChainTimestamp(ts);
      }
    };
    fetch();
    const iv = setInterval(fetch, 4000);
    return () => clearInterval(iv);
  }, [proposal.useBlockNumber, getBlockNumber, getChainTimestamp, proposal.id]);
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
  // 必须与合约一致：区块模式用 block.number，时间戳模式用 block.timestamp
  // 本地节点 block.timestamp 仅随出块推进，不能用 Date.now()
  const nowOrBlock = proposal.useBlockNumber ? (currentBlock ?? 0) : (chainTimestamp ?? 0);
  const timeReady = proposal.useBlockNumber ? currentBlock !== null : chainTimestamp !== null;
  const canStartRegistration = !proposal.autoAdvance || (timeReady && nowOrBlock >= proposal.registrationStart);
  const canStartVoting = !proposal.autoAdvance || (timeReady && nowOrBlock >= proposal.votingStart);
  const canStartTallying = !proposal.autoAdvance || (timeReady && nowOrBlock > proposal.votingEnd);

  const timeRemaining = () => {
    // 手动推进模式下无时间截止，不显示剩余时间
    if (!proposal.autoAdvance) return "由创建者推进";
    if (proposal.useBlockNumber) {
      const cur = currentBlock ?? 0;
      if (currentBlock === null) return "区块模式";
      if (proposal.status === VotingState.Created) {
        const blocksLeft = proposal.registrationStart - cur;
        if (blocksLeft <= 0) return "可推进";
        return `还需 ${blocksLeft} 区块开始`;
      }
      if (proposal.status === VotingState.Registration) {
        const blocksLeft = proposal.registrationEnd - cur;
        if (blocksLeft <= 0) return "可推进";
        return `还需 ${blocksLeft} 区块`;
      }
      if (proposal.status === VotingState.Voting) {
        const blocksLeft = proposal.votingEnd - cur;
        if (blocksLeft <= 0) return "可推进";
        return `还需 ${blocksLeft} 区块`;
      }
      return "区块模式";
    }
    // 根据当前阶段使用对应的截止时间（延长 registrationEnd/votingEnd 后会通过 refresh 更新）
    const endTs = proposal.status === VotingState.Created ? proposal.registrationStart
      : proposal.status === VotingState.Registration ? proposal.registrationEnd
      : proposal.votingEnd;
    const end = new Date(endTs * 1000);
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
          {proposal.registrationRule === RegistrationRule.Approval && (
            <Badge 
              variant="outline" 
              className="text-xs border-cyan-500/50 text-cyan-400"
            >
              <UserCheck className="w-3 h-3 inline mr-1" /> 创建者审核
            </Badge>
          )}
          {proposal.registrationRule === RegistrationRule.NFTHolder && (
            <Badge 
              variant="outline" 
              className="text-xs border-purple-500/50 text-purple-400"
            >
              <ImageIcon className="w-3 h-3 inline mr-1" /> NFT 持有者
            </Badge>
          )}
          {proposal.registrationRule === RegistrationRule.TokenHolder && (
            <Badge 
              variant="outline" 
              className="text-xs border-amber-500/50 text-amber-400"
            >
              <Coins className="w-3 h-3 inline mr-1" /> Token 持有者
            </Badge>
          )}
          {isCreator && (
            <Badge variant="outline" className="text-xs border-violet-500/50 text-violet-400">
              <Crown className="w-3 h-3 inline mr-1" /> 创建者
            </Badge>
          )}
        </div>

        {/* 投票进度 - 支持多选项，根据可见性配置控制显示 */}
        {proposal.status === VotingState.Voting || proposal.status === VotingState.Finalized ? (
          <div className="space-y-3">
            {/* 排序选择投票：投票阶段只显示参与人数，不显示逐选项票数 */}
            {proposal.rule === VotingRule.RankedChoice && proposal.status === VotingState.Voting ? (
              canViewProgress ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center py-4 space-y-2">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Users className="w-5 h-5 text-violet-400" />
                      <span className="text-lg font-semibold">
                        已投票 {proposal.totalVotesCast.toLocaleString()} / {proposal.totalVoters.toLocaleString()} 人
                      </span>
                    </div>
                    <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                        style={{ width: `${proposal.totalVoters > 0 ? (proposal.totalVotesCast / proposal.totalVoters) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-xs text-zinc-500">
                      排序选择投票 · 结果将在揭示阶段通过逐轮淘汰计算
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <EyeOff className="w-5 h-5 mx-auto text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-500">进度未公开</p>
                </div>
              )
            ) : (
              <>
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
                
                {/* RCV 已完成提示 */}
                {proposal.rule === VotingRule.RankedChoice && proposal.status === VotingState.Finalized && canViewResult && (
                  <p className="text-xs text-violet-400/70 text-center pt-1">
                    以上为即时决选（IRV）逐轮淘汰后的最终票数
                  </p>
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
              </>
            )}
          </div>
        ) : (
          <div className="py-2">
            {/* 选民数量 - 根据选民列表可见性控制 */}
            {canViewVoterList ? (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-zinc-500">
                  已注册选民: {proposal.totalVoters.toLocaleString()}
                </p>
                {proposal.totalVoters > 0 && (
                  <button
                    onClick={async () => {
                      setShowVoterListDialog(true);
                      if (voterListAddresses.length === 0 && !loadingVoterList) {
                        setLoadingVoterList(true);
                        const list = onLoadRegisteredVoters ? await onLoadRegisteredVoters(proposal.id) : null;
                        if (list) setVoterListAddresses(list);
                        setLoadingVoterList(false);
                      }
                    }}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors"
                  >
                    <Users className="w-3 h-3" />
                    查看选民列表
                    {loadingVoterList && <span className="ml-1 animate-spin">⏳</span>}
                  </button>
                )}
                <Dialog open={showVoterListDialog} onOpenChange={setShowVoterListDialog}>
                  <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-zinc-100 flex items-center gap-2">
                        <Users className="w-5 h-5 text-violet-400" />
                        选民列表
                      </DialogTitle>
                      <DialogDescription className="text-zinc-400">
                        共 {voterListAddresses.length} 位已注册选民
                      </DialogDescription>
                    </DialogHeader>
                    {loadingVoterList ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
                      </div>
                    ) : voterListAddresses.length > 0 ? (
                      <div className="max-h-64 overflow-y-auto space-y-1 py-2">
                        {voterListAddresses.map((addr, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 text-sm"
                          >
                            <span className="text-zinc-500 w-6 text-right">{i + 1}.</span>
                            <span className="text-zinc-300 font-mono text-xs truncate">
                              {addr}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-6 text-zinc-500">
                        <p className="text-sm">暂无选民数据</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
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
                      if (voteRecords.length === 0 && rankedVoteRecords.length === 0 && !loadingRecords) {
                        setLoadingRecords(true);
                        // RCV 提案加载完整排名记录
                        if (proposal.rule === VotingRule.RankedChoice && onLoadRankedVoteRecords) {
                          const ranked = await onLoadRankedVoteRecords(proposal.id);
                          if (ranked) setRankedVoteRecords(ranked);
                          if (onLoadRegisteredVoters) {
                            const registered = await onLoadRegisteredVoters(proposal.id);
                            if (registered) {
                              const votedSet = new Set((ranked || []).map((r) => r.voter.toLowerCase()));
                              setNotVotedAddresses(registered.filter((addr) => !votedSet.has(addr.toLowerCase())));
                            }
                          }
                        } else {
                          const records = onLoadVoteRecords ? await onLoadVoteRecords(proposal.id) : null;
                          if (records) setVoteRecords(records);
                          if (onLoadRegisteredVoters) {
                            const registered = await onLoadRegisteredVoters(proposal.id);
                            if (registered) {
                              const votedSet = new Set((records || []).map((r) => r.voter.toLowerCase()));
                              setNotVotedAddresses(registered.filter((addr) => !votedSet.has(addr.toLowerCase())));
                            }
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
                      共 {proposal.rule === VotingRule.RankedChoice ? rankedVoteRecords.length : voteRecords.length} 人已投票，{notVotedAddresses.length} 人未投票
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {/* RCV 排序投票详情 */}
                    {proposal.rule === VotingRule.RankedChoice ? (
                      <>
                        {rankedVoteRecords.length > 0 ? (
                          rankedVoteRecords.map((record, idx) => {
                            const voteTime = new Date(record.timestamp * 1000).toLocaleString();
                            return (
                              <div
                                key={`ranked-${idx}`}
                                className="bg-zinc-800/50 rounded-lg p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <p className="text-sm text-zinc-300 font-mono break-all">
                                    {record.voter}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {record.ranking.map((optIdx, rank) => {
                                    const color = optionColorConfig[optIdx % optionColorConfig.length];
                                    const optionName = proposal.options[optIdx] || `选项${optIdx + 1}`;
                                    return (
                                      <div key={rank} className="flex items-center gap-1">
                                        {rank > 0 && <span className="text-zinc-600 text-xs">→</span>}
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r ${color.gradient} text-white`}>
                                          <span className="opacity-70">#{rank + 1}</span>
                                          {optionName}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p className="text-xs text-zinc-500">
                                  投票时间: {voteTime}
                                </p>
                              </div>
                            );
                          })
                        ) : null}
                      </>
                    ) : (
                      <>
                        {/* 普通投票详情 */}
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
                      </>
                    )}
                    {/* 未投票的人 */}
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
                    {voteRecords.length === 0 && rankedVoteRecords.length === 0 && notVotedAddresses.length === 0 && !loadingRecords && (
                      <div className="py-8 text-center">
                        <p className="text-zinc-500">暂无投票记录</p>
                      </div>
                    )}
                  </div>
                  
                  {/* 统计摘要 */}
                  {proposal.rule === VotingRule.RankedChoice ? (
                    rankedVoteRecords.length > 0 && (
                      <div className="pt-3 border-t border-zinc-800 mt-3">
                        <p className="text-xs text-zinc-500 text-center">
                          首选分布：
                          {proposal.options.map((opt, idx) => {
                            const count = rankedVoteRecords.filter(r => r.ranking[0] === idx).length;
                            const color = optionColorConfig[idx % optionColorConfig.length];
                            return (
                              <span key={idx} className={`ml-2 ${color.text}`}>
                                {opt}: {count}票
                              </span>
                            );
                          })}
                          <span className="ml-2 text-zinc-400">未投票: {notVotedAddresses.length}人</span>
                        </p>
                        <p className="text-xs text-zinc-600 text-center mt-1">
                          最终结果由即时决选（IRV）算法逐轮淘汰计算
                        </p>
                      </div>
                    )
                  ) : (
                    voteRecords.length > 0 && (
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
                    )
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

          {/* 取消投票按钮 - 创建者可在 Created / Registration / Voting 状态下取消 */}
          {(proposal.status === VotingState.Created || proposal.status === VotingState.Registration || proposal.status === VotingState.Voting) && isCreator && onCancelVoting && (
            <Button
              onClick={() => onCancelVoting(proposal.id)}
              disabled={!wallet.isConnected}
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500"
            >
              取消投票
            </Button>
          )}

          {/* 延长注册期 - 仅自动推进模式下有效；手动推进无时间截止，无需延长 */}
          {proposal.status === VotingState.Registration && isCreator && proposal.autoAdvance && proposal.allowExtension !== false && onExtendRegistrationEnd && (
            <Button
              onClick={() => {
                if (proposal.useBlockNumber) {
                  setExtendAddBlocks(20);
                  setExtendAddMinutes(0);
                  setExtendAddHours(0);
                  setExtendAddDays(0);
                  setExtendNewValue(String(proposal.registrationEnd + 20));
                } else {
                  setExtendAddMinutes(0);
                  setExtendAddHours(1);
                  setExtendAddDays(0);
                  setExtendAddBlocks(0);
                  setExtendNewValue(String(proposal.registrationEnd + 3600));
                }
                setShowExtendRegDialog(true);
              }}
              disabled={!wallet.isConnected}
              variant="outline"
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500"
            >
              延长注册期
            </Button>
          )}

          {/* 延长投票期 - 仅自动推进模式下有效；手动推进无时间截止，无需延长 */}
          {proposal.status === VotingState.Voting && isCreator && proposal.autoAdvance && proposal.allowExtension !== false && onExtendVotingEnd && (
            <Button
              onClick={() => {
                if (proposal.useBlockNumber) {
                  setExtendAddBlocks(20);
                  setExtendAddMinutes(0);
                  setExtendAddHours(0);
                  setExtendAddDays(0);
                  setExtendNewValue(String(proposal.votingEnd + 20));
                } else {
                  setExtendAddMinutes(0);
                  setExtendAddHours(1);
                  setExtendAddDays(0);
                  setExtendAddBlocks(0);
                  setExtendNewValue(String(proposal.votingEnd + 3600));
                }
                setShowExtendVoteDialog(true);
              }}
              disabled={!wallet.isConnected}
              variant="outline"
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500"
            >
              延长投票期
            </Button>
          )}

          {/* 注册阶段按钮 */}
          {proposal.status === VotingState.Registration && (
            <>
              {proposal.rule === VotingRule.Weighted && proposal.weightGroupNames.length > 0 ? (
                <>
                  <Button
                    onClick={() => {
                      setSelectedGroupIndex(null);
                      setShowWeightGroupDialog(true);
                    }}
                    disabled={!wallet.isConnected || proposal.isRegistered}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                  >
                    {proposal.isRegistered ? "已注册" : "选择分组注册"}
                  </Button>
                  <Dialog open={showWeightGroupDialog} onOpenChange={setShowWeightGroupDialog}>
                    <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
                      <DialogHeader>
                        <DialogTitle className="text-zinc-100 flex items-center gap-2">
                          <Crown className="w-5 h-5 text-amber-400" />
                          选择权重分组
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                          不同分组的投票权重不同，请选择您所属的分组
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2 py-2">
                        {proposal.weightGroupNames.map((name, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedGroupIndex(idx)}
                            className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between ${
                              selectedGroupIndex === idx
                                ? "border-amber-500 bg-amber-500/10"
                                : "border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <div>
                              <p className="font-medium text-sm text-zinc-100">{name}</p>
                              <p className="text-xs text-zinc-500">权重: {proposal.weightGroupWeights[idx]}x</p>
                            </div>
                            {selectedGroupIndex === idx && (
                              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      <Button
                        onClick={() => {
                          if (selectedGroupIndex !== null) {
                            const isAnon = proposal.privacy === PrivacyLevel.Anonymous || proposal.privacy === PrivacyLevel.FullPrivacy;
                            if (isAnon && onRegisterAnonymousWeighted) {
                              onRegisterAnonymousWeighted(proposal.id, selectedGroupIndex);
                            } else {
                              onRegisterWeighted(proposal.id, selectedGroupIndex);
                            }
                            setShowWeightGroupDialog(false);
                          }
                        }}
                        disabled={selectedGroupIndex === null}
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                      >
                        确认注册
                      </Button>
                    </DialogContent>
                  </Dialog>
                </>
              ) : (proposal.privacy === PrivacyLevel.Anonymous || proposal.privacy === PrivacyLevel.FullPrivacy) && onRegisterAnonymous ? (
                <Button 
                  onClick={() => onRegisterAnonymous(proposal.id)}
                  disabled={!wallet.isConnected || proposal.isRegistered}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                >
                  {proposal.isRegistered ? "已注册" : "匿名注册"}
                </Button>
              ) : (
                <Button 
                  onClick={() => onRegister(proposal.id)}
                  disabled={!wallet.isConnected || proposal.isRegistered || proposal.isPending}
                  className={`flex-1 bg-gradient-to-r ${
                    proposal.isPending 
                      ? "from-yellow-500 to-amber-500 opacity-75 cursor-not-allowed" 
                      : "from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  } disabled:opacity-50`}
                >
                  {proposal.isRegistered ? "已注册" : proposal.isPending ? "等待审核中..." : 
                    proposal.registrationRule === RegistrationRule.Approval ? "申请注册" : 
                    proposal.registrationRule === RegistrationRule.NFTHolder ? "验证 NFT 并注册" :
                    proposal.registrationRule === RegistrationRule.TokenHolder ? "验证 Token 并注册" : "注册投票"}
                </Button>
              )}
              {/* 创建者审核面板入口 */}
              {proposal.registrationRule === RegistrationRule.Approval && 
                wallet.isConnected && wallet.address?.toLowerCase() === proposal.creator.toLowerCase() && (
                <Button
                  onClick={async () => {
                    if (onLoadPendingVoters) {
                      const voters = await onLoadPendingVoters(proposal.id);
                      setPendingVoters(voters);
                    }
                    setShowPendingDialog(true);
                  }}
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                  title="查看待审核的注册申请"
                >
                  <UserCheck className="w-4 h-4 mr-1" />
                  审核注册
                </Button>
              )}
              {/* 待审核选民审批弹窗 */}
              <Dialog open={showPendingDialog} onOpenChange={setShowPendingDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-zinc-100 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-cyan-400" />
                      注册审核
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                      审批或拒绝选民的注册申请
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {pendingVoters.length === 0 ? (
                      <p className="text-zinc-500 text-sm text-center py-4">暂无待审核的申请</p>
                    ) : (
                      <>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-zinc-400">共 {pendingVoters.length} 人待审核</span>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (onBatchApproveRegistrations) {
                                onBatchApproveRegistrations(proposal.id, pendingVoters);
                                setShowPendingDialog(false);
                              }
                            }}
                            className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs"
                          >
                            全部通过
                          </Button>
                        </div>
                        {pendingVoters.map((voter) => (
                          <div key={voter} className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                            <span className="text-xs font-mono text-zinc-300 truncate max-w-[180px]" title={voter}>
                              {voter.slice(0, 6)}...{voter.slice(-4)}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (onApproveRegistration) {
                                    onApproveRegistration(proposal.id, voter);
                                    setPendingVoters(prev => prev.filter(v => v !== voter));
                                  }
                                }}
                                className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs h-7 px-2"
                              >
                                通过
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (onRejectRegistration) {
                                    onRejectRegistration(proposal.id, voter);
                                    setPendingVoters(prev => prev.filter(v => v !== voter));
                                  }
                                }}
                                className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs h-7 px-2"
                              >
                                拒绝
                              </Button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
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
                    votingRule={proposal.rule}
                    onVote={
                      (proposal.privacy === PrivacyLevel.Anonymous || proposal.privacy === PrivacyLevel.FullPrivacy) && onVoteAnonymous
                        ? (optionIndex) => onVoteAnonymous(proposal.id, optionIndex)
                        : (optionIndex) => onVote(proposal.id, optionIndex)
                    }
                    onQuadraticVote={(optionIndexes, voteAmounts) => {
                      const isAnon = proposal.privacy === PrivacyLevel.Anonymous || proposal.privacy === PrivacyLevel.FullPrivacy;
                      if (isAnon && onVoteAnonymousQuadratic) onVoteAnonymousQuadratic(proposal.id, optionIndexes, voteAmounts);
                      else onQuadraticVote(proposal.id, optionIndexes, voteAmounts);
                    }}
                    onRankedVote={(rankedOptions) => {
                      const isAnon = proposal.privacy === PrivacyLevel.Anonymous || proposal.privacy === PrivacyLevel.FullPrivacy;
                      if (isAnon && onVoteAnonymousRanked) onVoteAnonymousRanked(proposal.id, rankedOptions);
                      else onRankedVote(proposal.id, rankedOptions);
                    }}
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

          {/* 已完成 - 点击弹出仅展示结果的弹窗 */}
          {proposal.status === VotingState.Finalized && (
            <>
              <Button
                variant="outline"
                className="flex-1 border-zinc-700 hover:border-violet-500 text-zinc-100"
                onClick={() => setShowResultDialog(true)}
              >
                查看结果
              </Button>
              <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
                <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="text-zinc-100 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-violet-400" />
                      投票结果 - {proposal.title}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                      {canViewResult ? "投票已结束，以下为胜出选项" : ""}
                    </DialogDescription>
                  </DialogHeader>
                  {canViewResult ? (
                    totalVotes > 0 ? (
                      <div className="flex flex-col items-center py-6 space-y-3">
                        <Crown className="w-10 h-10 text-yellow-400" />
                        <span className={`text-2xl font-bold ${optionColorConfig[leadingIndex % optionColorConfig.length].text}`}>
                          {proposal.options[leadingIndex]}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-6 space-y-2 text-zinc-500">
                        <p className="text-sm">暂无投票数据</p>
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col items-center py-8 space-y-3 text-zinc-500">
                      <EyeOff className="w-10 h-10 text-zinc-600" />
                      <p className="text-sm font-medium">结果未公开</p>
                      <p className="text-xs text-zinc-600">
                        {isCreator ? "您已设置结果不公开" : isParticipant ? "仅创建者可查看结果" : "您无权查看此投票结果"}
                      </p>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </CardContent>
      {/* 延长注册期/投票期弹窗 - 始终挂载 */}
      <Dialog open={showExtendRegDialog} onOpenChange={setShowExtendRegDialog}>
        <ExtendDialogContent
          title="延长注册截止时间"
          currentEnd={proposal.registrationEnd}
          useBlockNumber={proposal.useBlockNumber}
          extendNewValue={extendNewValue}
          setExtendNewValue={setExtendNewValue}
          extendAddMinutes={extendAddMinutes}
          setExtendAddMinutes={setExtendAddMinutes}
          extendAddHours={extendAddHours}
          setExtendAddHours={setExtendAddHours}
          extendAddDays={extendAddDays}
          setExtendAddDays={setExtendAddDays}
          extendAddBlocks={extendAddBlocks}
          setExtendAddBlocks={setExtendAddBlocks}
          extendLoading={extendLoading}
          onConfirm={async () => {
            if (!onExtendRegistrationEnd) return false;
            setExtendLoading(true);
            const ok = await onExtendRegistrationEnd(proposal.id, Number(extendNewValue));
            setExtendLoading(false);
            return ok;
          }}
          onClose={() => setShowExtendRegDialog(false)}
        />
      </Dialog>
      <Dialog open={showExtendVoteDialog} onOpenChange={setShowExtendVoteDialog}>
        <ExtendDialogContent
          title="延长投票截止时间"
          currentEnd={proposal.votingEnd}
          useBlockNumber={proposal.useBlockNumber}
          extendNewValue={extendNewValue}
          setExtendNewValue={setExtendNewValue}
          extendAddMinutes={extendAddMinutes}
          setExtendAddMinutes={setExtendAddMinutes}
          extendAddHours={extendAddHours}
          setExtendAddHours={setExtendAddHours}
          extendAddDays={extendAddDays}
          setExtendAddDays={setExtendAddDays}
          extendAddBlocks={extendAddBlocks}
          setExtendAddBlocks={setExtendAddBlocks}
          extendLoading={extendLoading}
          onConfirm={async () => {
            if (!onExtendVotingEnd) return false;
            setExtendLoading(true);
            const ok = await onExtendVotingEnd(proposal.id, Number(extendNewValue));
            setExtendLoading(false);
            return ok;
          }}
          onClose={() => setShowExtendVoteDialog(false)}
        />
      </Dialog>
    </Card>
  );
}

interface VoteDialogProps {
  options: string[];
  votingRule?: number;
  onVote: (optionIndex: number) => void;
  onQuadraticVote?: (optionIndexes: number[], voteAmounts: number[]) => void;
  onRankedVote?: (rankedOptions: number[]) => void;
}

function VoteDialog({ options, votingRule, onVote, onQuadraticVote, onRankedVote }: VoteDialogProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 二次方投票：每个选项的投票数量
  const [qvAmounts, setQvAmounts] = useState<number[]>(() => new Array(options.length).fill(0));
  // 排序选择：排名数组（ranking[i] = 选项i的排名，0表示未排序）
  const [ranking, setRanking] = useState<number[]>(() => new Array(options.length).fill(0));

  const isQuadratic = votingRule === VotingRule.Quadratic;
  const isRanked = votingRule === VotingRule.RankedChoice;
  const TOTAL_CREDITS = 100;

  // 二次方投票积分计算
  const qvCosts = qvAmounts.map(v => v * v);
  const qvTotalCost = qvCosts.reduce((a, b) => a + b, 0);
  const qvRemaining = TOTAL_CREDITS - qvTotalCost;
  const qvTotalVotes = qvAmounts.reduce((a, b) => a + b, 0);
  const qvOverBudget = qvTotalCost > TOTAL_CREDITS;

  const adjustQvAmount = (index: number, delta: number) => {
    setQvAmounts(prev => {
      const next = [...prev];
      const newVal = Math.max(0, Math.min(10, next[index] + delta));
      next[index] = newVal;
      return next;
    });
  };

  // 排序选择：已排名数量和辅助函数
  const rankedCount = ranking.filter(r => r > 0).length;
  const allRanked = rankedCount === options.length;

  const toggleRank = (index: number) => {
    setRanking(prev => {
      const next = [...prev];
      if (next[index] > 0) {
        // 取消排名：移除并调整后续排名
        const removedRank = next[index];
        next[index] = 0;
        for (let i = 0; i < next.length; i++) {
          if (next[i] > removedRank) {
            next[i]--;
          }
        }
      } else {
        // 分配下一个排名
        const nextRank = prev.filter(r => r > 0).length + 1;
        next[index] = nextRank;
      }
      return next;
    });
  };

  // 获取排序后的选项索引数组（按排名顺序）
  const getRankedOptions = (): number[] => {
    return ranking
      .map((rank, idx) => ({ rank, idx }))
      .filter(item => item.rank > 0)
      .sort((a, b) => a.rank - b.rank)
      .map(item => item.idx);
  };

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
    setIsSubmitting(true);
    setStep(2);

    if (isRanked && onRankedVote) {
      await Promise.resolve(onRankedVote(getRankedOptions()));
    } else if (isQuadratic && onQuadraticVote) {
      // 收集 voteAmount > 0 的选项
      const indexes: number[] = [];
      const amounts: number[] = [];
      qvAmounts.forEach((amt, idx) => {
        if (amt > 0) {
          indexes.push(idx);
          amounts.push(amt);
        }
      });
      await Promise.resolve(onQuadraticVote(indexes, amounts));
    } else {
      if (selected === null) return;
      await Promise.resolve(onVote(selected));
    }
    setStep(3);
  };

  // 提交按钮是否可用
  const canSubmit = isRanked
    ? allRanked && !isSubmitting
    : isQuadratic
      ? qvTotalVotes > 0 && !qvOverBudget && !isSubmitting
      : selected !== null && !isSubmitting;

  return (
    <div className="space-y-6 py-4">
      {step === 1 && (
        <>
          {/* 二次方投票：积分状态栏 */}
          {isQuadratic && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  积分分配
                </span>
                <span className={`font-mono font-bold ${qvOverBudget ? "text-rose-400" : qvRemaining < 20 ? "text-amber-400" : "text-emerald-400"}`}>
                  {qvTotalCost} / {TOTAL_CREDITS} 已用
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    qvOverBudget
                      ? "bg-gradient-to-r from-rose-500 to-red-500"
                      : qvRemaining < 20
                        ? "bg-gradient-to-r from-amber-500 to-orange-500"
                        : "bg-gradient-to-r from-emerald-500 to-cyan-500"
                  }`}
                  style={{ width: `${Math.min(100, (qvTotalCost / TOTAL_CREDITS) * 100)}%` }}
                />
              </div>
              {qvOverBudget && (
                <p className="text-xs text-rose-400 font-medium">积分不足！请减少投票数量</p>
              )}
              <p className="text-xs text-zinc-500">
                投 N 票的成本 = N\u00B2 积分。例：3 票 = 9 积分，10 票 = 100 积分
              </p>
            </div>
          )}

          {/* 排序选择：排名进度 */}
          {isRanked && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-violet-400" />
                  偏好排序
                </span>
                <span className={`font-mono font-bold ${allRanked ? "text-emerald-400" : "text-zinc-400"}`}>
                  {rankedCount} / {options.length} 已排序
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    allRanked
                      ? "bg-gradient-to-r from-emerald-500 to-cyan-500"
                      : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  }`}
                  style={{ width: `${(rankedCount / options.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500">
                点击选项按偏好排序，第1名为最优先。再次点击可取消排名。
              </p>
            </div>
          )}

          <div className={`space-y-3 ${options.length > 4 ? 'max-h-80 overflow-y-auto pr-2' : ''}`}>
            {options.map((option, index) => {
              const style = optionStyles[index % optionStyles.length];
              const isSelected = selected === index;
              const votes = qvAmounts[index];
              const cost = qvCosts[index];
              const hasVotes = votes > 0;
              
              if (isQuadratic) {
                // 二次方投票 UI：每个选项有 +/- 控件
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      hasVotes
                        ? "border-opacity-100"
                        : "border-zinc-800"
                    }`}
                    style={{
                      borderColor: hasVotes ? style.hex : undefined,
                      backgroundColor: hasVotes ? `${style.hex}0d` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                        style={{ backgroundColor: hasVotes ? style.hex : "#27272a" }}
                      >
                        {style.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-zinc-100 truncate">{option}</p>
                        {hasVotes ? (
                          <p className="text-xs mt-0.5" style={{ color: style.hex }}>
                            {votes} 票 = {cost} 积分
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-500 mt-0.5">未分配</p>
                        )}
                      </div>
                      {/* +/- 控件 */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => adjustQvAmount(index, -1)}
                          disabled={votes <= 0}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-30 disabled:hover:bg-zinc-800 transition-colors flex items-center justify-center font-bold text-lg"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono font-bold text-zinc-100 text-lg">
                          {votes}
                        </span>
                        <button
                          onClick={() => adjustQvAmount(index, 1)}
                          disabled={votes >= 10}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-30 disabled:hover:bg-zinc-800 transition-colors flex items-center justify-center font-bold text-lg"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (isRanked) {
                // 排序选择 UI：点击分配排名
                const rank = ranking[index];
                const isRankedOption = rank > 0;
                return (
                  <button
                    key={index}
                    onClick={() => toggleRank(index)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      isRankedOption
                        ? "border-opacity-100"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                    style={{
                      borderColor: isRankedOption ? style.hex : undefined,
                      backgroundColor: isRankedOption ? `${style.hex}0d` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 text-lg"
                        style={{
                          backgroundColor: isRankedOption ? style.hex : "#27272a",
                          color: isRankedOption ? "white" : "#71717a",
                        }}
                      >
                        {isRankedOption ? rank : "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-zinc-100 truncate">{option}</p>
                        <p className="text-xs mt-0.5" style={{ color: isRankedOption ? style.hex : "#71717a" }}>
                          {isRankedOption ? `第 ${rank} 选择` : "点击排序"}
                        </p>
                      </div>
                      {isRankedOption && (
                        <span className="text-xs text-zinc-500 shrink-0">点击取消</span>
                      )}
                    </div>
                  </button>
                );
              }

              // 普通投票 UI：单选
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

          {/* 二次方投票：积分分配汇总 */}
          {isQuadratic && qvTotalVotes > 0 && (
            <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-zinc-300">分配汇总</p>
              {qvAmounts.map((amt, idx) => amt > 0 && (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-zinc-400">{options[idx]}</span>
                  <span className="text-zinc-300 font-mono">{amt} 票 ({amt * amt} 积分)</span>
                </div>
              ))}
              <div className="flex justify-between text-xs pt-1 border-t border-zinc-700 mt-1">
                <span className="text-zinc-300 font-medium">剩余积分</span>
                <span className={`font-mono font-bold ${qvOverBudget ? "text-rose-400" : "text-emerald-400"}`}>
                  {qvRemaining}
                </span>
              </div>
            </div>
          )}

          {/* 排序选择：排名顺序汇总 */}
          {isRanked && rankedCount > 0 && (
            <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-zinc-300">偏好排序</p>
              {getRankedOptions().map((optIdx, rank) => {
                const style = optionStyles[optIdx % optionStyles.length];
                return (
                  <div key={optIdx} className="flex items-center gap-2 text-xs">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                      style={{ backgroundColor: style.hex }}>
                      {rank + 1}
                    </span>
                    <span className="text-zinc-300 truncate">{options[optIdx]}</span>
                  </div>
                );
              })}
              {!allRanked && (
                <p className="text-xs text-zinc-500 pt-1 border-t border-zinc-700 mt-1">
                  还需排序 {options.length - rankedCount} 个选项
                </p>
              )}
            </div>
          )}

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
              {isRanked ? (
                <>
                  <p className="font-medium text-zinc-300">排序选择投票</p>
                  <p>
                    请按偏好排序所有选项。计票时逐轮淘汰最低票选项，
                    将其选票转移给下一偏好，直到某选项获得过半支持。
                  </p>
                </>
              ) : isQuadratic ? (
                <>
                  <p className="font-medium text-zinc-300">二次方投票</p>
                  <p>
                    您拥有 {TOTAL_CREDITS} 积分，可分配给多个选项。投 N 票的成本为 N\u00B2 积分，
                    这使得集中投票变得更加昂贵，鼓励更均衡的表达偏好。
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium text-zinc-300">隐私保护投票</p>
                  <p>
                    您的投票将使用 Semaphore 零知识证明匿名提交，同时使用 Paillier
                    同态加密保护投票内容。
                  </p>
                </>
              )}
            </div>
          </div>

          <Button
            onClick={handleSubmitVote}
            disabled={!canSubmit}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 disabled:opacity-50"
          >
            {isRanked
              ? `确认排序 (${rankedCount}/${options.length})`
              : isQuadratic
                ? `确认投票 (${qvTotalVotes} 票 / ${qvTotalCost} 积分)`
                : "确认投票"}
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
  whitelistGroupIndexes: number[];  // 白名单地址对应的权重分组索引
  weightGroupNames: string[];    // 加权投票：权重分组名称
  weightGroupWeights: number[];  // 加权投票：权重分组权重值
  registrationRule: RegistrationRule;  // 注册规则
  tokenContractAddress: string;  // NFT/Token 合约地址
  tokenMinBalance: number;       // 最低持有数量
  useBlockNumber?: boolean;      // 时间控制：true=用区块高度，false=用时间戳
  allowExtension?: boolean;      // 是否允许动态延长注册期/投票期
}

interface CreateProposalCardProps {
  wallet: WalletState;
  onCreateProposal: (proposal: CreateProposalData) => Promise<void>;
  showToast: (type: "success" | "error" | "warning" | "info", title: string, description?: string) => void;
  getBlockNumber?: () => Promise<number | null>;
}

function CreateProposalCard({ wallet, onCreateProposal, showToast, getBlockNumber }: CreateProposalCardProps) {
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
  const [tokenContractAddress, setTokenContractAddress] = useState(""); // NFT/Token 合约地址
  const [tokenMinBalance, setTokenMinBalance] = useState(1); // 最低持有数量
  const [enableWhitelist, setEnableWhitelist] = useState(false); // 是否启用白名单
  const [whitelist, setWhitelist] = useState<string[]>([]); // 白名单地址列表
  const [whitelistInput, setWhitelistInput] = useState(""); // 白名单输入框
  const [whitelistGroupMap, setWhitelistGroupMap] = useState<Record<string, number>>({}); // 地址 -> 分组索引
  const [whitelistActiveGroup, setWhitelistActiveGroup] = useState(0); // 当前选中的分组 tab
  // 加权投票：权重分组
  const [weightGroups, setWeightGroups] = useState<{ name: string; weight: number }[]>([
    { name: "普通组", weight: 1 },
    { name: "高权重组", weight: 3 },
  ]);
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
  
  // 时间配置（单位：分钟 或 区块数）
  const [useBlockNumber, setUseBlockNumber] = useState(false);       // 使用区块高度
  const [useSpecificDates, setUseSpecificDates] = useState(false);  // 时间戳模式下：true=具体日期，false=相对分钟
  const [registrationDelay, setRegistrationDelay] = useState(1);     // 注册开始延迟（分钟或区块）
  const [registrationDuration, setRegistrationDuration] = useState(5); // 注册持续时长（分钟或区块）
  const [votingDuration, setVotingDuration] = useState(60);          // 投票持续时长（分钟或区块）
  const [autoAdvance, setAutoAdvance] = useState(true);              // 推进模式：true=自动，false=手动
  const [allowExtension, setAllowExtension] = useState(true);          // 是否允许动态延长注册期/投票期
  // 具体日期模式下的四个时间点（datetime-local 格式：YYYY-MM-DDTHH:mm）
  const [regStartDate, setRegStartDate] = useState("");
  const [regEndDate, setRegEndDate] = useState("");
  const [voteStartDate, setVoteStartDate] = useState("");
  const [voteEndDate, setVoteEndDate] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setOptions(["赞成", "反对"]);
    setRule(VotingRule.SimpleMajority);
    setPrivacy(PrivacyLevel.Public);
    setRegistrationRule(0);
    setTokenContractAddress("");
    setTokenMinBalance(1);
    setEnableWhitelist(false);
    setWhitelist([]);
    setWhitelistInput("");
    setWhitelistGroupMap({});
    setWhitelistActiveGroup(0);
    setWeightGroups([{ name: "普通组", weight: 1 }, { name: "高权重组", weight: 3 }]);
    setVoteCountsVisibility(1);
    setVoteDetailsVisibility(1);
    setVoterListVisibility(1);
    setResultVisibility(3);
    setProgressVisibility(1);
    setUseBlockNumber(false);
    setUseSpecificDates(false);
    setRegistrationDelay(1);
    setRegistrationDuration(5);
    setVotingDuration(60);
    setRegStartDate("");
    setRegEndDate("");
    setVoteStartDate("");
    setVoteEndDate("");
    setAutoAdvance(true);
    setAllowExtension(true);
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

    let regStart: number;
    let regEnd: number;
    let voteStart: number;
    let voteEnd: number;

    if (useBlockNumber && getBlockNumber) {
      const block = await getBlockNumber();
      if (block == null) {
        showToast("error", "无法获取区块高度", "请确保已连接钱包和正确网络");
        setIsSubmitting(false);
        return;
      }
      regStart = block + registrationDelay;
      regEnd = regStart + registrationDuration;
      voteStart = regEnd;
      voteEnd = voteStart + votingDuration;
    } else if (useBlockNumber) {
      showToast("error", "区块模式不可用", "当前环境不支持获取区块高度");
      setIsSubmitting(false);
      return;
    } else if (useSpecificDates) {
      // 具体日期模式：将 datetime-local 转为 Unix 秒
      if (!regStartDate || !regEndDate || !voteStartDate || !voteEndDate) {
        showToast("error", "请填写完整的时间配置", "注册与投票的起止时间不能为空");
        setIsSubmitting(false);
        return;
      }
      regStart = Math.floor(new Date(regStartDate).getTime() / 1000);
      regEnd = Math.floor(new Date(regEndDate).getTime() / 1000);
      voteStart = Math.floor(new Date(voteStartDate).getTime() / 1000);
      voteEnd = Math.floor(new Date(voteEndDate).getTime() / 1000);
      if (regEnd <= regStart || voteStart < regEnd || voteEnd <= voteStart) {
        showToast("error", "时间顺序无效", "请确保：注册结束 > 注册开始，投票开始 >= 注册结束，投票结束 > 投票开始");
        setIsSubmitting(false);
        return;
      }
    } else {
      const now = Math.floor(Date.now() / 1000);
      regStart = now + registrationDelay * 60;
      regEnd = regStart + registrationDuration * 60;
      voteStart = regEnd;
      voteEnd = voteStart + votingDuration * 60;
    }

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
      endTime: useBlockNumber ? `Block ${voteEnd}` : new Date(voteEnd * 1000).toISOString(),
      privacy: privacy as PrivacyLevel,
      rule: rule as VotingRule,
      registrationStart: regStart,
      registrationEnd: regEnd,
      votingStart: voteStart,
      votingEnd: voteEnd,
      autoAdvance,
      allowExtension,
      visibilityBitmap,
      enableWhitelist,
      whitelist,
      whitelistGroupIndexes: (rule === VotingRule.Weighted && enableWhitelist)
        ? whitelist.map(addr => whitelistGroupMap[addr] ?? 0)
        : [],
      weightGroupNames: rule === VotingRule.Weighted ? weightGroups.map(g => g.name) : [],
      weightGroupWeights: rule === VotingRule.Weighted ? weightGroups.map(g => g.weight) : [],
      registrationRule: registrationRule as RegistrationRule,
      tokenContractAddress: (registrationRule === RegistrationRule.NFTHolder || registrationRule === RegistrationRule.TokenHolder) 
        ? tokenContractAddress : "0x0000000000000000000000000000000000000000",
      tokenMinBalance: (registrationRule === RegistrationRule.NFTHolder || registrationRule === RegistrationRule.TokenHolder) 
        ? tokenMinBalance : 0,
      useBlockNumber: useBlockNumber || undefined,
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
            <div className="flex items-center justify-between">
              <DialogTitle className="text-zinc-100 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-sm">
                  {step}
                </span>
                {step === 1 ? "基本信息" : step === 2 ? "投票选项" : "规则配置"}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { resetForm(); }}
                className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-1.5"
                title="重置所有配置"
              >
                <RotateCcw className="w-4 h-4" />
                重置配置
              </Button>
            </div>
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
                      <label className="text-sm text-zinc-300">
                        投票规则
                        {(privacy === PrivacyLevel.Anonymous || privacy === PrivacyLevel.FullPrivacy) && (
                          <span className="ml-1 text-xs text-amber-400">（匿名支持：简单多数、加权、二次方、排序选择）</span>
                        )}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: VotingRule.SimpleMajority, label: "简单多数", desc: "票数最多者胜出" },
                          { value: VotingRule.Weighted, label: "加权投票", desc: "为不同选民设置不同权重" },
                          { value: VotingRule.Quadratic, label: "二次方投票", desc: "100积分自由分配，投票越集中成本越高" },
                          { value: VotingRule.RankedChoice, label: "排序选择", desc: "按偏好排序选项，逐轮淘汰最低票" },
                        ].map((r) => {
                          const isAnonymous = privacy === PrivacyLevel.Anonymous || privacy === PrivacyLevel.FullPrivacy;
                          const anonymousSupported = [VotingRule.SimpleMajority, VotingRule.Weighted, VotingRule.Quadratic, VotingRule.RankedChoice] as const;
                          const disabled = isAnonymous && !(anonymousSupported as readonly number[]).includes(r.value);
                          return (
                            <button
                              key={r.value}
                              onClick={() => {
                                if (disabled) return;
                                setRule(r.value);
                              }}
                              disabled={disabled}
                              className={`p-2 rounded-lg border-2 text-left transition-all ${
                                rule === r.value
                                  ? "border-violet-500 bg-violet-500/10"
                                  : disabled
                                    ? "border-zinc-800 bg-zinc-900/50 opacity-50 cursor-not-allowed"
                                    : "border-zinc-800 hover:border-zinc-700"
                              }`}
                            >
                              <p className="font-medium text-sm text-zinc-100">{r.label}</p>
                              <p className="text-xs text-zinc-500">{r.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 加权投票：权重分组配置 */}
                    {rule === VotingRule.Weighted && (
                      <div className="col-span-2 space-y-2">
                        <label className="text-sm text-zinc-300 flex items-center gap-2">
                          <Crown className="w-4 h-4 text-amber-400" /> 权重分组
                        </label>
                        <p className="text-xs text-zinc-500">选民注册时选择分组，投票按分组权重计入票数</p>
                        <div className="space-y-2">
                          {weightGroups.map((group, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={group.name}
                                onChange={(e) => {
                                  const newGroups = [...weightGroups];
                                  newGroups[idx].name = e.target.value;
                                  setWeightGroups(newGroups);
                                }}
                                placeholder="分组名称"
                                className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-zinc-500">权重</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={group.weight}
                                  onChange={(e) => {
                                    const newGroups = [...weightGroups];
                                    newGroups[idx].weight = Math.max(1, parseInt(e.target.value) || 1);
                                    setWeightGroups(newGroups);
                                  }}
                                  className="w-16 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 text-center focus:border-violet-500 focus:outline-none"
                                />
                              </div>
                              {weightGroups.length > 1 && (
                                <button
                                  onClick={() => setWeightGroups(weightGroups.filter((_, i) => i !== idx))}
                                  className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {weightGroups.length < 8 && (
                          <button
                            onClick={() => setWeightGroups([...weightGroups, { name: "", weight: 1 }])}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            + 添加分组
                          </button>
                        )}
                      </div>
                    )}

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
                            onClick={() => {
                              setPrivacy(p.value);
                              if (p.value === PrivacyLevel.Anonymous || p.value === PrivacyLevel.FullPrivacy) {
                                setRule(VotingRule.SimpleMajority);
                                setRegistrationRule(RegistrationRule.Open);
                                setEnableWhitelist(false);
                              }
                            }}
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

                  {/* 注册规则 - 匿名投票仅支持开放注册 */}
                  <div className={`space-y-2 ${(privacy === PrivacyLevel.Anonymous || privacy === PrivacyLevel.FullPrivacy) ? "opacity-75" : ""}`}>
                    <label className="text-sm text-zinc-300">
                      注册规则
                      {(privacy === PrivacyLevel.Anonymous || privacy === PrivacyLevel.FullPrivacy) && (
                        <span className="ml-1 text-xs text-amber-400">（匿名投票仅支持开放注册）</span>
                      )}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: 0, label: "开放注册", desc: "任何人都可注册", icon: Globe },
                        { value: 1, label: "创建者审核", desc: "需创建者批准", icon: UserCheck },
                        { value: 2, label: "NFT 持有者", desc: "持有指定 NFT", icon: ImageIcon },
                        { value: 3, label: "Token 持有者", desc: "持有指定 Token", icon: Coins },
                      ].map((r) => {
                        const isAnonymous = privacy === PrivacyLevel.Anonymous || privacy === PrivacyLevel.FullPrivacy;
                        const disabled = isAnonymous && r.value !== RegistrationRule.Open;
                        return (
                          <button
                            key={r.value}
                            onClick={() => {
                              if (disabled) return;
                              setRegistrationRule(r.value);
                            }}
                            disabled={disabled}
                            className={`p-2 rounded-lg border-2 text-left transition-all ${
                              registrationRule === r.value
                                ? "border-cyan-500 bg-cyan-500/10"
                                : disabled
                                  ? "border-zinc-800 bg-zinc-900/50 opacity-50 cursor-not-allowed"
                                  : "border-zinc-800 hover:border-zinc-700"
                            }`}
                          >
                            <r.icon className="w-4 h-4 text-zinc-300" />
                            <p className="font-medium text-sm text-zinc-100 mt-1">{r.label}</p>
                            <p className="text-xs text-zinc-500">{r.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* NFT/Token 合约配置 - 选择 NFT 持有者或 Token 持有者时显示 */}
                  {(registrationRule === RegistrationRule.NFTHolder || registrationRule === RegistrationRule.TokenHolder) && (
                    <div className="space-y-3 p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
                      <p className="text-sm text-cyan-400 font-medium">
                        {registrationRule === RegistrationRule.NFTHolder ? "NFT 合约配置" : "Token 合约配置"}
                      </p>
                      <div className="space-y-2">
                        <label className="text-xs text-zinc-400">
                          {registrationRule === RegistrationRule.NFTHolder ? "ERC-721 合约地址" : "ERC-20 合约地址"}
                        </label>
                        <input
                          type="text"
                          value={tokenContractAddress}
                          onChange={(e) => setTokenContractAddress(e.target.value)}
                          placeholder="0x..."
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs text-zinc-400">
                          {registrationRule === RegistrationRule.NFTHolder ? "最低持有数量（NFT 个数）" : "最低持有数量（Token 数量）"}
                        </label>
                        <input
                          type="number"
                          value={tokenMinBalance}
                          onChange={(e) => setTokenMinBalance(Math.max(1, parseInt(e.target.value) || 1))}
                          min={1}
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:border-cyan-500 focus:outline-none"
                        />
                        <p className="text-xs text-zinc-500">
                          {registrationRule === RegistrationRule.NFTHolder 
                            ? "用户至少持有该数量的 NFT 才能注册" 
                            : "用户至少持有该数量的 Token 才能注册（注意 Token 精度，如 USDT 为 6 位小数）"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 白名单开关与配置 - 匿名投票不支持 */}
                  {privacy !== PrivacyLevel.Anonymous && privacy !== PrivacyLevel.FullPrivacy && (
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
                  )}

                  {/* 白名单地址导入 - 启用白名单时显示 */}
                  {enableWhitelist && (
                    <div className="space-y-3 p-3 rounded-xl bg-zinc-800/50 border border-cyan-500/30">
                      <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Upload className="w-4 h-4" /> 白名单地址导入
                        {rule === VotingRule.Weighted && (
                          <span className="text-xs text-cyan-400 ml-1">（按权重分组分配）</span>
                        )}
                      </p>

                      {/* 加权投票模式：分组 Tab */}
                      {rule === VotingRule.Weighted && weightGroups.length > 0 && (
                        <div className="flex gap-1 p-1 rounded-lg bg-zinc-900">
                          {weightGroups.map((group, gIdx) => {
                            const groupCount = whitelist.filter(addr => (whitelistGroupMap[addr] ?? 0) === gIdx).length;
                            return (
                              <button
                                key={gIdx}
                                onClick={() => setWhitelistActiveGroup(gIdx)}
                                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                  whitelistActiveGroup === gIdx
                                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                                }`}
                              >
                                {group.name} (×{group.weight})
                                {groupCount > 0 && (
                                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-500/30 text-cyan-300">
                                    {groupCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* 输入区域 */}
                      <div className="space-y-2">
                        <textarea
                          value={whitelistInput}
                          onChange={(e) => setWhitelistInput(e.target.value)}
                          placeholder={rule === VotingRule.Weighted
                            ? `输入要加入「${weightGroups[whitelistActiveGroup]?.name || ""}」分组的地址，每行一个或用逗号分隔`
                            : "输入钱包地址，每行一个或用逗号分隔\n例如：\n0x1234...\n0x5678..."}
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
                              // 加权模式下，为新增地址设置分组
                              if (rule === VotingRule.Weighted) {
                                const newMap = { ...whitelistGroupMap };
                                addresses.forEach(addr => {
                                  if (!(addr in newMap)) {
                                    newMap[addr] = whitelistActiveGroup;
                                  }
                                });
                                setWhitelistGroupMap(newMap);
                              }
                              setWhitelistInput("");
                            }}
                            disabled={!whitelistInput.trim()}
                            className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                          >
                            添加地址
                          </Button>
                          <Button
                            onClick={() => {
                              if (rule === VotingRule.Weighted) {
                                // 加权模式：仅清空当前分组的地址
                                const groupAddrs = whitelist.filter(addr => (whitelistGroupMap[addr] ?? 0) === whitelistActiveGroup);
                                const remaining = whitelist.filter(addr => (whitelistGroupMap[addr] ?? 0) !== whitelistActiveGroup);
                                const newMap = { ...whitelistGroupMap };
                                groupAddrs.forEach(addr => delete newMap[addr]);
                                setWhitelist(remaining);
                                setWhitelistGroupMap(newMap);
                              } else {
                                setWhitelist([]);
                              }
                            }}
                            disabled={rule === VotingRule.Weighted
                              ? whitelist.filter(addr => (whitelistGroupMap[addr] ?? 0) === whitelistActiveGroup).length === 0
                              : whitelist.length === 0}
                            variant="outline"
                            className="border-zinc-700 text-zinc-400 hover:text-rose-400 hover:border-rose-500 disabled:opacity-50"
                          >
                            {rule === VotingRule.Weighted ? "清空本组" : "清空"}
                          </Button>
                        </div>
                      </div>

                      {/* 已添加的地址列表 */}
                      {whitelist.length > 0 && (
                        <div className="space-y-2">
                          <p className={`text-xs ${whitelist.length > 200 ? "text-rose-400" : "text-zinc-400"}`}>
                            {rule === VotingRule.Weighted
                              ? `共 ${whitelist.length} 个地址（当前分组 ${whitelist.filter(addr => (whitelistGroupMap[addr] ?? 0) === whitelistActiveGroup).length} 个）`
                              : `已添加 ${whitelist.length} 个地址`}
                            {whitelist.length > 200 && " (超过 200 限制，请减少)"}
                          </p>
                          <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                            {(rule === VotingRule.Weighted
                              ? whitelist.filter(addr => (whitelistGroupMap[addr] ?? 0) === whitelistActiveGroup)
                              : whitelist
                            ).map((addr) => (
                              <div
                                key={addr}
                                className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 group"
                              >
                                <span className="text-xs font-mono text-zinc-300 truncate flex-1">
                                  {addr.slice(0, 10)}...{addr.slice(-8)}
                                </span>
                                {rule === VotingRule.Weighted && (
                                  <span className="text-xs text-cyan-400 mx-2">
                                    {weightGroups[whitelistGroupMap[addr] ?? 0]?.name}
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    setWhitelist(whitelist.filter(a => a !== addr));
                                    const newMap = { ...whitelistGroupMap };
                                    delete newMap[addr];
                                    setWhitelistGroupMap(newMap);
                                  }}
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

                  {/* 动态延长机制 - 仅自动推进模式显示 */}
                  {autoAdvance && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
                      <div>
                        <p className="text-sm font-medium text-zinc-300">允许动态延长</p>
                        <p className="text-xs text-zinc-500">创建者可在注册期/投票期内延长截止时间</p>
                      </div>
                      <button
                        onClick={() => setAllowExtension(!allowExtension)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          allowExtension ? "bg-amber-500" : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            allowExtension ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* 时间配置 - 仅自动推进模式显示 */}
                  {autoAdvance && (
                    <div className="space-y-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                          <Timer className="w-4 h-4" /> 时间配置（单位：{useBlockNumber ? "区块" : useSpecificDates ? "具体日期" : "分钟"}）
                        </p>
                        <div className="flex items-center gap-4">
                          {!useBlockNumber && (
                            <div className="flex rounded-lg overflow-hidden border border-zinc-600">
                              <button
                                type="button"
                                onClick={() => setUseSpecificDates(false)}
                                className={`px-2 py-1 text-xs ${!useSpecificDates ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                              >
                                相对时间
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setUseSpecificDates(true);
                                  if (!regStartDate) {
                                    const now = new Date();
                                    const pad = (n: number) => String(n).padStart(2, "0");
                                    const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                    setRegStartDate(toStr(now));
                                    const rEnd = new Date(now.getTime() + 5 * 60 * 1000);
                                    setRegEndDate(toStr(rEnd));
                                    const vStart = new Date(rEnd.getTime());
                                    setVoteStartDate(toStr(vStart));
                                    const vEnd = new Date(vStart.getTime() + 60 * 60 * 1000);
                                    setVoteEndDate(toStr(vEnd));
                                  }
                                }}
                                className={`px-2 py-1 text-xs ${useSpecificDates ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                              >
                                具体日期
                              </button>
                            </div>
                          )}
                          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useBlockNumber}
                              onChange={(e) => setUseBlockNumber(e.target.checked)}
                              className="rounded border-zinc-600 text-violet-500 focus:ring-violet-500"
                            />
                            使用区块高度
                          </label>
                        </div>
                      </div>

                      {useBlockNumber ? (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">注册开始延迟（区块）</label>
                              <input type="number" min="1" value={registrationDelay} onChange={(e) => setRegistrationDelay(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-amber-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">注册阶段时长（区块）</label>
                              <input type="number" min="1" value={registrationDuration} onChange={(e) => setRegistrationDuration(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-emerald-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">投票阶段时长（区块）</label>
                              <input type="number" min="1" value={votingDuration} onChange={(e) => setVotingDuration(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-violet-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-700 space-y-1">
                            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 注册: 当前块+{registrationDelay} 开始, 持续 <span className="text-emerald-400">{registrationDuration}</span> 区块</p>
                            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 投票: 当前块+{registrationDelay + registrationDuration} 开始, 持续 <span className="text-violet-400">{votingDuration}</span> 区块</p>
                          </div>
                        </>
                      ) : useSpecificDates ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">注册开始时间</label>
                              <input type="datetime-local" value={regStartDate} onChange={(e) => setRegStartDate(e.target.value)} min={new Date().toISOString().slice(0, 16)} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">注册结束时间</label>
                              <input type="datetime-local" value={regEndDate} onChange={(e) => setRegEndDate(e.target.value)} min={regStartDate || undefined} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">投票开始时间</label>
                              <input type="datetime-local" value={voteStartDate} onChange={(e) => setVoteStartDate(e.target.value)} min={regEndDate || undefined} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 focus:border-violet-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">投票结束时间</label>
                              <input type="datetime-local" value={voteEndDate} onChange={(e) => setVoteEndDate(e.target.value)} min={voteStartDate || undefined} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 focus:border-violet-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-700">
                            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 将上述日期转为链上时间戳提交</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">注册开始延迟（分钟）</label>
                              <input type="number" min="1" value={registrationDelay} onChange={(e) => setRegistrationDelay(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-amber-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">注册阶段时长（分钟）</label>
                              <input type="number" min="1" value={registrationDuration} onChange={(e) => setRegistrationDuration(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-emerald-500 focus:outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-zinc-400">投票阶段时长（分钟）</label>
                              <input type="number" min="1" value={votingDuration} onChange={(e) => setVotingDuration(Math.max(1, Number(e.target.value)))} className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-center focus:border-violet-500 focus:outline-none" />
                            </div>
                          </div>
                          <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-700 space-y-1">
                            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 注册: 创建后 {registrationDelay} 分钟开始, 持续 <span className="text-emerald-400">{registrationDuration}</span> 分钟</p>
                            <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> 投票: 创建后 {registrationDelay + registrationDuration} 分钟开始, 持续 <span className="text-violet-400">{votingDuration}</span> 分钟</p>
                          </div>
                        </>
                      )}
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
        
        // 如果用户已连接，获取每个提案的用户状态（包含待审核状态）
        const localProposals: LocalProposal[] = [];
        for (const voting of votings) {
          let userStatus = { registered: false, pending: false, voted: false };
          if (wallet.isConnected && wallet.address) {
            userStatus = await votingFactory.getUserFullStatus(voting.id, wallet.address);
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

  // 处理注册 - 调用真实合约（审核模式下为申请注册）
  const handleRegisterAnonymous = useCallback(async (proposalId: number) => {
    if (!wallet.isConnected || !wallet.address) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const storageKey = `semaphore-identity-${wallet.address.toLowerCase()}-${proposalId}`;
    try {
      const { Identity } = await import("@semaphore-protocol/identity");
      let identity: InstanceType<typeof Identity>;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        identity = Identity.import(stored);
      } else {
        identity = new Identity();
        localStorage.setItem(storageKey, identity.export());
      }
      const commitment = identity.commitment;
      const success = await votingFactory.registerVoterAnonymous(proposalId, commitment);
      if (success) {
        addToast("success", "匿名注册成功", "您已成功注册，投票时将保持匿名");
        refreshProposals();
      } else if (votingFactory.error) {
        addToast("error", "匿名注册失败", votingFactory.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", "匿名注册失败", msg);
    }
  }, [wallet.isConnected, wallet.address, votingFactory, refreshProposals, addToast]);

  const handleRegister = useCallback(async (proposalId: number) => {
    console.log("handleRegister: 点击注册, proposalId:", proposalId);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    
    // 查找该提案判断是否审核模式
    const proposal = proposals.find(p => p.id === proposalId);
    const isApprovalMode = proposal?.registrationRule === RegistrationRule.Approval;
    
    console.log("handleRegister: 调用 votingFactory.registerVoter, 审核模式:", isApprovalMode);
    const success = await votingFactory.registerVoter(proposalId);
    console.log("handleRegister: 结果:", success, "error:", votingFactory.error);
    if (success) {
      if (isApprovalMode) {
        addToast("info", "申请已提交", "请等待创建者审核您的注册申请");
      } else {
        addToast("success", "注册成功", "您已成功注册为投票人");
      }
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", isApprovalMode ? "申请失败" : "注册失败", votingFactory.error);
    }
  }, [wallet.isConnected, wallet.address, votingFactory, refreshProposals, addToast, proposals]);

  // 处理匿名加权注册
  const handleRegisterAnonymousWeighted = useCallback(async (proposalId: number, groupIndex: number) => {
    if (!wallet.isConnected || !wallet.address) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const storageKey = `semaphore-identity-${wallet.address.toLowerCase()}-${proposalId}-w-${groupIndex}`;
    const groupStorageKey = `semaphore-weight-group-${wallet.address.toLowerCase()}-${proposalId}`;
    try {
      const { Identity } = await import("@semaphore-protocol/identity");
      let identity: InstanceType<typeof Identity>;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        identity = Identity.import(stored);
      } else {
        identity = new Identity();
        localStorage.setItem(storageKey, identity.export());
        localStorage.setItem(groupStorageKey, String(groupIndex));
      }
      const commitment = identity.commitment;
      const success = await votingFactory.registerVoterAnonymousWeighted(proposalId, commitment, groupIndex);
      if (success) {
        addToast("success", "匿名加权注册成功", "您已成功注册，投票时将保持匿名");
        refreshProposals();
      } else if (votingFactory.error) {
        addToast("error", "匿名加权注册失败", votingFactory.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", "匿名加权注册失败", msg);
    }
  }, [wallet.isConnected, wallet.address, votingFactory, refreshProposals, addToast]);

  // 处理加权注册 - 调用真实合约（审核模式下为申请注册）
  const handleRegisterWeighted = useCallback(async (proposalId: number, groupIndex: number) => {
    console.log("handleRegisterWeighted: 点击加权注册, proposalId:", proposalId, "groupIndex:", groupIndex);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }

    const proposal = proposals.find(p => p.id === proposalId);
    const isApprovalMode = proposal?.registrationRule === RegistrationRule.Approval;
    
    console.log("handleRegisterWeighted: 调用 votingFactory.registerVoterWeighted, 审核模式:", isApprovalMode);
    const success = await votingFactory.registerVoterWeighted(proposalId, groupIndex);
    console.log("handleRegisterWeighted: 结果:", success, "error:", votingFactory.error);
    if (success) {
      if (isApprovalMode) {
        addToast("info", "申请已提交", "请等待创建者审核您的注册申请");
      } else {
        addToast("success", "注册成功", "您已成功注册为加权投票人");
      }
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", isApprovalMode ? "申请失败" : "注册失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast, proposals]);

  // 处理审批注册 - 调用真实合约（仅创建者）
  const handleApproveRegistration = useCallback(async (proposalId: number, voter: string) => {
    console.log("handleApproveRegistration: proposalId:", proposalId, "voter:", voter);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const success = await votingFactory.approveRegistration(proposalId, voter);
    if (success) {
      addToast("success", "审批通过", `已批准 ${voter.slice(0, 6)}...${voter.slice(-4)} 的注册`);
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "审批失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 批量审批注册
  const handleBatchApproveRegistrations = useCallback(async (proposalId: number, voters: string[]) => {
    console.log("handleBatchApproveRegistrations: proposalId:", proposalId, "count:", voters.length);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const success = await votingFactory.batchApproveRegistrations(proposalId, voters);
    if (success) {
      addToast("success", "批量审批通过", `已批准 ${voters.length} 人的注册`);
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "批量审批失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 拒绝注册
  const handleRejectRegistration = useCallback(async (proposalId: number, voter: string) => {
    console.log("handleRejectRegistration: proposalId:", proposalId, "voter:", voter);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const success = await votingFactory.rejectRegistration(proposalId, voter);
    if (success) {
      addToast("success", "已拒绝", `已拒绝 ${voter.slice(0, 6)}...${voter.slice(-4)} 的注册申请`);
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "拒绝失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 获取待审核选民列表
  const handleLoadPendingVoters = useCallback(async (proposalId: number): Promise<string[]> => {
    return await votingFactory.getPendingVoters(proposalId);
  }, [votingFactory]);

  // 处理匿名投票 - 生成 ZK 证明（支持简单多数、加权）
  const handleVoteAnonymous = useCallback(async (proposalId: number, optionIndex: number) => {
    if (!wallet.isConnected || !wallet.address) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const proposal = proposals.find((p) => p.id === proposalId);
    const isWeighted = proposal?.rule === VotingRule.Weighted;
    const groupIndex = isWeighted ? parseInt(localStorage.getItem(`semaphore-weight-group-${wallet.address!.toLowerCase()}-${proposalId}`) ?? "-1", 10) : 0;
    const storageKey = isWeighted
      ? `semaphore-identity-${wallet.address.toLowerCase()}-${proposalId}-w-${groupIndex}`
      : `semaphore-identity-${wallet.address.toLowerCase()}-${proposalId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      addToast("error", "匿名投票失败", "未找到本地身份，请先完成匿名注册");
      return;
    }
    if (isWeighted && (groupIndex < 0 || groupIndex >= (proposal?.weightGroupWeights.length ?? 0))) {
      addToast("error", "匿名投票失败", "未找到加权分组信息");
      return;
    }
    try {
      addToast("info", "正在生成零知识证明...", "首次可能需下载证明文件，请稍候");
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");
      const { fetchSemaphoreGroupMembers } = await import("@/utils/semaphoreGroup");

      const identity = Identity.import(stored);
      const provider = await votingFactory.getProvider();
      const semaphoreAddress = await votingFactory.getSemaphoreAddress();
      const groupId = isWeighted
        ? BigInt(await votingFactory.getVotingSemaphoreGroupIdByWeight(proposalId, groupIndex))
        : BigInt(await votingFactory.getVotingSemaphoreGroupId(proposalId));
      if (groupId === 0n) {
        addToast("error", "匿名投票失败", "未找到 Semaphore 群组");
        return;
      }

      const commitments = await fetchSemaphoreGroupMembers(provider, semaphoreAddress, groupId);
      if (commitments.length === 0) {
        addToast("error", "匿名投票失败", "群组尚无成员");
        return;
      }

      const group = new Group(commitments);
      const scope = BigInt(proposalId);
      const message = BigInt(optionIndex);
      const proof = await generateProof(identity, group, message, scope);

      const proofForContract = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: BigInt(proof.merkleTreeRoot),
        nullifier: BigInt(proof.nullifier),
        message: BigInt(proof.message),
        scope: BigInt(proof.scope),
        points: (proof.points as string[]).map((p) => BigInt(p)),
      };

      const success = isWeighted
        ? await votingFactory.castVoteAnonymousWeighted(proposalId, optionIndex, groupIndex, proofForContract)
        : await votingFactory.castVoteAnonymous(proposalId, optionIndex, proofForContract);
      if (success) {
        addToast("success", "投票成功", "您的匿名投票已提交");
        refreshProposals();
      } else if (votingFactory.error) {
        addToast("error", "匿名投票失败", votingFactory.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", "匿名投票失败", msg);
    }
  }, [wallet.isConnected, wallet.address, votingFactory, refreshProposals, addToast, proposals]);

  // 处理匿名排序选择投票
  const handleVoteAnonymousRanked = useCallback(async (proposalId: number, rankedOptions: number[]) => {
    if (!wallet.isConnected || !wallet.address) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const proposal = proposals.find((p) => p.id === proposalId);
    const n = proposal?.options?.length ?? 0;
    if (n === 0 || rankedOptions.length !== n) {
      addToast("error", "匿名排序投票失败", "排名数据无效");
      return;
    }
    const storageKey = `semaphore-identity-${wallet.address.toLowerCase()}-${proposalId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      addToast("error", "匿名投票失败", "未找到本地身份，请先完成匿名注册");
      return;
    }
    // 编码排名：sum(rankedOptions[i] * n^i)
    let encoded = 0n;
    let base = 1n;
    for (let i = 0; i < n; i++) {
      encoded += BigInt(rankedOptions[i]) * base;
      base *= BigInt(n);
    }
    try {
      addToast("info", "正在生成零知识证明...", "首次可能需下载证明文件，请稍候");
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");
      const { fetchSemaphoreGroupMembers } = await import("@/utils/semaphoreGroup");

      const identity = Identity.import(stored);
      const provider = await votingFactory.getProvider();
      const semaphoreAddress = await votingFactory.getSemaphoreAddress();
      const groupId = BigInt(await votingFactory.getVotingSemaphoreGroupId(proposalId));
      if (groupId === 0n) {
        addToast("error", "匿名投票失败", "未找到 Semaphore 群组");
        return;
      }

      const commitments = await fetchSemaphoreGroupMembers(provider, semaphoreAddress, groupId);
      if (commitments.length === 0) {
        addToast("error", "匿名投票失败", "群组尚无成员");
        return;
      }

      const group = new Group(commitments);
      const scope = BigInt(proposalId);
      const proof = await generateProof(identity, group, encoded, scope);

      const proofForContract = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: BigInt(proof.merkleTreeRoot),
        nullifier: BigInt(proof.nullifier),
        message: BigInt(proof.message),
        scope: BigInt(proof.scope),
        points: (proof.points as string[]).map((p) => BigInt(p)),
      };

      const success = await votingFactory.castVoteAnonymousRanked(proposalId, encoded, proofForContract);
      if (success) {
        addToast("success", "投票成功", "您的匿名排序投票已提交");
        refreshProposals();
      } else if (votingFactory.error) {
        addToast("error", "匿名排序投票失败", votingFactory.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", "匿名排序投票失败", msg);
    }
  }, [wallet.isConnected, wallet.address, votingFactory, refreshProposals, addToast, proposals]);

  // 处理匿名二次方投票
  const handleVoteAnonymousQuadratic = useCallback(async (proposalId: number, optionIndexes: number[], voteAmounts: number[]) => {
    if (!wallet.isConnected || !wallet.address) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const proposal = proposals.find((p) => p.id === proposalId);
    const n = proposal?.options?.length ?? 0;
    if (n === 0 || n > 8) {
      addToast("error", "匿名二次方投票失败", "选项数量无效");
      return;
    }
    const storageKey = `semaphore-identity-${wallet.address.toLowerCase()}-${proposalId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      addToast("error", "匿名投票失败", "未找到本地身份，请先完成匿名注册");
      return;
    }
    // 构建 votes[i]，编码为 message = sum(votes[i] << (i*4))
    const votes = new Array<number>(n).fill(0);
    for (let i = 0; i < optionIndexes.length; i++) {
      if (optionIndexes[i] < n && voteAmounts[i] > 0) {
        votes[optionIndexes[i]] = Math.min(10, voteAmounts[i]);
      }
    }
    let encoded = 0n;
    for (let i = 0; i < n; i++) {
      encoded += BigInt(votes[i]) << BigInt(i * 4);
    }
    try {
      addToast("info", "正在生成零知识证明...", "首次可能需下载证明文件，请稍候");
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");
      const { fetchSemaphoreGroupMembers } = await import("@/utils/semaphoreGroup");

      const identity = Identity.import(stored);
      const provider = await votingFactory.getProvider();
      const semaphoreAddress = await votingFactory.getSemaphoreAddress();
      const groupId = BigInt(await votingFactory.getVotingSemaphoreGroupId(proposalId));
      if (groupId === 0n) {
        addToast("error", "匿名投票失败", "未找到 Semaphore 群组");
        return;
      }

      const commitments = await fetchSemaphoreGroupMembers(provider, semaphoreAddress, groupId);
      if (commitments.length === 0) {
        addToast("error", "匿名投票失败", "群组尚无成员");
        return;
      }

      const group = new Group(commitments);
      const scope = BigInt(proposalId);
      const proof = await generateProof(identity, group, encoded, scope);

      const proofForContract = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: BigInt(proof.merkleTreeRoot),
        nullifier: BigInt(proof.nullifier),
        message: BigInt(proof.message),
        scope: BigInt(proof.scope),
        points: (proof.points as string[]).map((p) => BigInt(p)),
      };

      const success = await votingFactory.castVoteAnonymousQuadratic(proposalId, encoded, proofForContract);
      if (success) {
        addToast("success", "投票成功", "您的匿名二次方投票已提交");
        refreshProposals();
      } else if (votingFactory.error) {
        addToast("error", "匿名二次方投票失败", votingFactory.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", "匿名二次方投票失败", msg);
    }
  }, [wallet.isConnected, wallet.address, votingFactory, refreshProposals, addToast, proposals]);

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

  // 处理二次方投票 - 调用真实合约
  const handleQuadraticVote = useCallback(async (proposalId: number, optionIndexes: number[], voteAmounts: number[]) => {
    console.log("handleQuadraticVote: proposalId:", proposalId, "options:", optionIndexes, "amounts:", voteAmounts);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }

    const success = await votingFactory.castQuadraticVote(proposalId, optionIndexes, voteAmounts);
    if (success) {
      addToast("success", "二次方投票成功", "您的积分分配已提交");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "二次方投票失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  // 处理排序选择投票 - 调用真实合约
  const handleRankedVote = useCallback(async (proposalId: number, rankedOptions: number[]) => {
    console.log("handleRankedVote: proposalId:", proposalId, "ranking:", rankedOptions);
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }

    const success = await votingFactory.castRankedVote(proposalId, rankedOptions);
    if (success) {
      addToast("success", "排序选择投票成功", "您的偏好排序已提交");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "排序选择投票失败", votingFactory.error);
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

  const handleCancelVoting = useCallback(async (proposalId: number) => {
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return;
    }
    const success = await votingFactory.cancelVoting(proposalId);
    if (success) {
      addToast("success", "投票已取消", "该投票已被取消");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "取消失败", votingFactory.error);
    }
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  const handleExtendRegistrationEnd = useCallback(async (proposalId: number, newEnd: number): Promise<boolean> => {
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return false;
    }
    const success = await votingFactory.extendRegistrationEnd(proposalId, newEnd);
    if (success) {
      addToast("success", "注册期已延长", "新的截止时间已生效");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "延长失败", votingFactory.error);
    }
    return success;
  }, [wallet.isConnected, votingFactory, refreshProposals, addToast]);

  const handleExtendVotingEnd = useCallback(async (proposalId: number, newEnd: number): Promise<boolean> => {
    if (!wallet.isConnected) {
      addToast("warning", "请先连接钱包");
      return false;
    }
    const success = await votingFactory.extendVotingEnd(proposalId, newEnd);
    if (success) {
      addToast("success", "投票期已延长", "新的截止时间已生效");
      refreshProposals();
    } else if (votingFactory.error) {
      addToast("error", "延长失败", votingFactory.error);
    }
    return success;
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

  // 加载排序选择投票的完整排名记录
  const handleLoadRankedVoteRecords = useCallback(async (proposalId: number): Promise<RankedVoteRecord[] | null> => {
    const result = await votingFactory.getRankedVoteRecords(proposalId);
    if (!result) return null;

    const records: RankedVoteRecord[] = [];
    for (let i = 0; i < result.voters.length; i++) {
      records.push({
        voter: result.voters[i],
        ranking: result.rankings[i],
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
      whitelistGroupIndexes: proposalData.whitelistGroupIndexes || [],
      weightGroupNames: proposalData.weightGroupNames || [],
      weightGroupWeights: proposalData.weightGroupWeights || [],
      registrationRule: proposalData.registrationRule ?? RegistrationRule.Open,
      tokenContractAddress: proposalData.tokenContractAddress || "0x0000000000000000000000000000000000000000",
      tokenMinBalance: proposalData.tokenMinBalance || 0,
      useBlockNumber: proposalData.useBlockNumber ?? false,
      allowExtension: proposalData.allowExtension ?? true,
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
                    onRegisterAnonymous={handleRegisterAnonymous}
                    onRegisterAnonymousWeighted={handleRegisterAnonymousWeighted}
                    onRegisterWeighted={handleRegisterWeighted}
                    onVote={handleVote}
                    onVoteAnonymous={handleVoteAnonymous}
                    onVoteAnonymousRanked={handleVoteAnonymousRanked}
                    onVoteAnonymousQuadratic={handleVoteAnonymousQuadratic}
                    onQuadraticVote={handleQuadraticVote}
                    onRankedVote={handleRankedVote}
                    onStartRegistration={handleStartRegistration}
                    onStartVoting={handleStartVoting}
                    onStartTallying={handleStartTallying}
                    onRevealResult={handleRevealResult}
                    onCancelVoting={handleCancelVoting}
                    onExtendRegistrationEnd={handleExtendRegistrationEnd}
                    onExtendVotingEnd={handleExtendVotingEnd}
                    getBlockNumber={votingFactory.getBlockNumber}
                    getChainTimestamp={votingFactory.getChainTimestamp}
                    onLoadVoteRecords={handleLoadVoteRecords}
                    onLoadRankedVoteRecords={handleLoadRankedVoteRecords}
                        onLoadRegisteredVoters={handleLoadRegisteredVoters}
                    onApproveRegistration={handleApproveRegistration}
                    onRejectRegistration={handleRejectRegistration}
                    onBatchApproveRegistrations={handleBatchApproveRegistrations}
                    onLoadPendingVoters={handleLoadPendingVoters}
                  />
                ))}
              </div>

              {/* 侧边栏 */}
              <div className="space-y-4">
                <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} getBlockNumber={votingFactory.getBlockNumber} />
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
                        onRegisterAnonymous={handleRegisterAnonymous}
                        onRegisterAnonymousWeighted={handleRegisterAnonymousWeighted}
                        onRegisterWeighted={handleRegisterWeighted}
                        onVote={handleVote}
                        onVoteAnonymous={handleVoteAnonymous}
                        onVoteAnonymousRanked={handleVoteAnonymousRanked}
                        onVoteAnonymousQuadratic={handleVoteAnonymousQuadratic}
                        onQuadraticVote={handleQuadraticVote}
                        onRankedVote={handleRankedVote}
                        onStartRegistration={handleStartRegistration}
                        onStartVoting={handleStartVoting}
                        onStartTallying={handleStartTallying}
                        onRevealResult={handleRevealResult}
                        onCancelVoting={handleCancelVoting}
                        onExtendRegistrationEnd={handleExtendRegistrationEnd}
                        onExtendVotingEnd={handleExtendVotingEnd}
                        getBlockNumber={votingFactory.getBlockNumber}
                        getChainTimestamp={votingFactory.getChainTimestamp}
                        onLoadVoteRecords={handleLoadVoteRecords}
                        onLoadRankedVoteRecords={handleLoadRankedVoteRecords}
                        onLoadRegisteredVoters={handleLoadRegisteredVoters}
                        onApproveRegistration={handleApproveRegistration}
                        onRejectRegistration={handleRejectRegistration}
                        onBatchApproveRegistrations={handleBatchApproveRegistrations}
                        onLoadPendingVoters={handleLoadPendingVoters}
                      />
                    ))
                )}
              </div>
              <div className="space-y-4">
                <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} getBlockNumber={votingFactory.getBlockNumber} />
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
                ) : proposals.filter(p => p.status === VotingState.Finalized || p.status === VotingState.Cancelled).length === 0 ? (
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardContent className="py-12 text-center">
                      <p className="text-zinc-500">暂无已完成的提案</p>
                    </CardContent>
                  </Card>
                ) : (
                  proposals
                    .filter((p) => p.status === VotingState.Finalized || p.status === VotingState.Cancelled)
                    .map((proposal) => (
                      <ProposalCard 
                        key={proposal.id} 
                        proposal={proposal} 
                        wallet={wallet}
                        onRegister={handleRegister}
                        onRegisterAnonymous={handleRegisterAnonymous}
                        onRegisterAnonymousWeighted={handleRegisterAnonymousWeighted}
                        onRegisterWeighted={handleRegisterWeighted}
                        onVote={handleVote}
                        onVoteAnonymous={handleVoteAnonymous}
                        onVoteAnonymousRanked={handleVoteAnonymousRanked}
                        onVoteAnonymousQuadratic={handleVoteAnonymousQuadratic}
                        onQuadraticVote={handleQuadraticVote}
                        onRankedVote={handleRankedVote}
                        onStartRegistration={handleStartRegistration}
                        onStartVoting={handleStartVoting}
                        onStartTallying={handleStartTallying}
                        onRevealResult={handleRevealResult}
                        onCancelVoting={handleCancelVoting}
                        onExtendRegistrationEnd={handleExtendRegistrationEnd}
                        onExtendVotingEnd={handleExtendVotingEnd}
                        getBlockNumber={votingFactory.getBlockNumber}
                        getChainTimestamp={votingFactory.getChainTimestamp}
                        onLoadVoteRecords={handleLoadVoteRecords}
                        onLoadRankedVoteRecords={handleLoadRankedVoteRecords}
                        onLoadRegisteredVoters={handleLoadRegisteredVoters}
                        onApproveRegistration={handleApproveRegistration}
                        onRejectRegistration={handleRejectRegistration}
                        onBatchApproveRegistrations={handleBatchApproveRegistrations}
                        onLoadPendingVoters={handleLoadPendingVoters}
                      />
                    ))
                )}
              </div>
              <div className="space-y-4">
                <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} getBlockNumber={votingFactory.getBlockNumber} />
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
                            onRegisterAnonymous={handleRegisterAnonymous}
                            onRegisterAnonymousWeighted={handleRegisterAnonymousWeighted}
                            onRegisterWeighted={handleRegisterWeighted}
                            onVote={handleVote}
                            onVoteAnonymous={handleVoteAnonymous}
                            onVoteAnonymousRanked={handleVoteAnonymousRanked}
                            onVoteAnonymousQuadratic={handleVoteAnonymousQuadratic}
                            onQuadraticVote={handleQuadraticVote}
                            onRankedVote={handleRankedVote}
                            onStartRegistration={handleStartRegistration}
                            onStartVoting={handleStartVoting}
                            onStartTallying={handleStartTallying}
                            onRevealResult={handleRevealResult}
                            onCancelVoting={handleCancelVoting}
                            onExtendRegistrationEnd={handleExtendRegistrationEnd}
                            onExtendVotingEnd={handleExtendVotingEnd}
                            getBlockNumber={votingFactory.getBlockNumber}
                            getChainTimestamp={votingFactory.getChainTimestamp}
                            onLoadVoteRecords={handleLoadVoteRecords}
                            onLoadRankedVoteRecords={handleLoadRankedVoteRecords}
                            onLoadRegisteredVoters={handleLoadRegisteredVoters}
                            onApproveRegistration={handleApproveRegistration}
                            onRejectRegistration={handleRejectRegistration}
                            onBatchApproveRegistrations={handleBatchApproveRegistrations}
                            onLoadPendingVoters={handleLoadPendingVoters}
                          />
                        ))
                      )}
                    </div>
                    <div className="space-y-4">
                      <CreateProposalCard wallet={wallet} onCreateProposal={handleCreateProposal} showToast={addToast} getBlockNumber={votingFactory.getBlockNumber} />
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
