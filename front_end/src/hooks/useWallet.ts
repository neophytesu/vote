import { useState, useCallback, useEffect } from "react";
import { BrowserProvider, formatEther } from "ethers";

// 扩展 Window 类型以支持 ethereum 对象
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

export interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  shortAddress: string | null;
  balance: string | null;
  chainId: number | null;
  error: string | null;
}

const initialState: WalletState = {
  isConnected: false,
  isConnecting: false,
  address: null,
  shortAddress: null,
  balance: null,
  chainId: null,
  error: null,
};

// 获取链名称
export const getChainName = (chainId: number | null): string => {
  if (!chainId) return "未知网络";
  const chains: Record<number, string> = {
    1: "Ethereum",
    5: "Goerli",
    11155111: "Sepolia",
    137: "Polygon",
    80001: "Mumbai",
    42161: "Arbitrum",
    10: "Optimism",
    56: "BSC",
    43114: "Avalanche",
  };
  return chains[chainId] || `Chain ${chainId}`;
};

export function useWallet() {
  const [state, setState] = useState<WalletState>(initialState);

  // 格式化地址
  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // 获取账户余额
  const getBalance = async (provider: BrowserProvider, address: string) => {
    try {
      const balance = await provider.getBalance(address);
      return formatEther(balance);
    } catch {
      return null;
    }
  };

  // 连接钱包
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setState((prev) => ({
        ...prev,
        error: "请安装 MetaMask 钱包",
      }));
      // 打开 MetaMask 安装页面
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // 请求连接账户
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts.length === 0) {
        throw new Error("未获取到账户");
      }

      const address = accounts[0];
      const provider = new BrowserProvider(window.ethereum);

      // 获取链ID
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // 获取余额
      const balance = await getBalance(provider, address);

      setState({
        isConnected: true,
        isConnecting: false,
        address,
        shortAddress: formatAddress(address),
        balance,
        chainId,
        error: null,
      });
    } catch (err) {
      const error = err as Error & { code?: number };
      let errorMessage = "连接钱包失败";

      // 处理用户拒绝连接
      if (error.code === 4001) {
        errorMessage = "用户拒绝了连接请求";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setState({
        ...initialState,
        error: errorMessage,
      });
    }
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  // 切换网络
  const switchNetwork = useCallback(async (chainId: number) => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (err) {
      const error = err as Error & { code?: number };
      // 如果网络不存在，可以尝试添加
      if (error.code === 4902) {
        console.log("网络不存在，需要添加");
      }
    }
  }, []);

  // 监听账户变化
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: unknown) => {
      const accountsArray = accounts as string[];
      if (accountsArray.length === 0) {
        // 用户断开了连接
        setState(initialState);
      } else if (state.isConnected) {
        const address = accountsArray[0];
        const provider = new BrowserProvider(window.ethereum!);
        const balance = await getBalance(provider, address);

        setState((prev) => ({
          ...prev,
          address,
          shortAddress: formatAddress(address),
          balance,
        }));
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      const newChainId = parseInt(chainId as string, 16);
      setState((prev) => ({
        ...prev,
        chainId: newChainId,
      }));
      // 刷新页面以确保状态一致性
      // window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [state.isConnected]);

  // 检查是否已经连接（页面加载时）
  useEffect(() => {
    const checkConnection = async () => {
      if (!window.ethereum) return;

      try {
        const accounts = (await window.ethereum.request({
          method: "eth_accounts",
        })) as string[];

        if (accounts.length > 0) {
          const address = accounts[0];
          const provider = new BrowserProvider(window.ethereum);
          const network = await provider.getNetwork();
          const chainId = Number(network.chainId);
          const balance = await getBalance(provider, address);

          setState({
            isConnected: true,
            isConnecting: false,
            address,
            shortAddress: formatAddress(address),
            balance,
            chainId,
            error: null,
          });
        }
      } catch {
        // 忽略错误，保持断开状态
      }
    };

    checkConnection();
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    switchNetwork,
    getChainName: () => getChainName(state.chainId),
  };
}

