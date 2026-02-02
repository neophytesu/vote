import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  onClose: (id: string) => void;
}

const toastStyles: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  },
  error: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    icon: <XCircle className="w-5 h-5 text-rose-400" />,
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: <AlertCircle className="w-5 h-5 text-amber-400" />,
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: <AlertCircle className="w-5 h-5 text-blue-400" />,
  },
};

export function Toast({ id, type, title, description, onClose }: ToastProps) {
  const style = toastStyles[type];

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm shadow-lg animate-in slide-in-from-right-full duration-300",
        style.bg,
        style.border
      )}
    >
      <div className="shrink-0 mt-0.5">{style.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        {description && (
          <p className="text-xs text-zinc-400 mt-1">{description}</p>
        )}
      </div>
      <button
        onClick={() => onClose(id)}
        className="shrink-0 p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (type: ToastType, title: string, description?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const addToast = React.useCallback((type: ToastType, title: string, description?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, title, description }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              id={toast.id}
              type={toast.type}
              title={toast.title}
              description={toast.description}
              onClose={removeToast}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
