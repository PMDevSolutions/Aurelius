import { cn } from "@/lib/utils";
import { ArrowRight, Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "small";
  showArrow?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "default",
  showArrow,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[27px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-accent-blue text-white hover:bg-blue-600 border border-[#717171] shadow-[0px_2px_6.6px_0px_rgba(72,201,175,0.3)]",
        variant === "secondary" &&
          "bg-bg-500 text-text-primary hover:bg-bg-300",
        variant === "ghost" && "bg-transparent text-text-secondary hover:text-white",
        size === "default" && "px-4 py-[17px] text-button",
        size === "small" && "px-4 py-2 text-body-12",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      {showArrow && !loading && <ArrowRight className="h-4 w-4" />}
    </button>
  );
}
