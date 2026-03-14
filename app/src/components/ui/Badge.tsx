import { cn } from "@/lib/utils";
import type { CheckStatus, CheckPriority } from "@/types/seo";

interface BadgeProps {
  status: CheckStatus;
  priority?: CheckPriority;
  className?: string;
}

export function Badge({ status, priority, className }: BadgeProps) {
  const label =
    status === "pass"
      ? "Passed"
      : priority === "high"
        ? "High"
        : priority === "medium"
          ? "Medium"
          : "Low";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[27px] border border-white/40 px-2 py-1 text-body-12 font-medium text-black",
        status === "pass" && "bg-[#A2FFB4]",
        status === "fail" && priority === "high" && "bg-[#FF8484]",
        status === "fail" && priority === "medium" && "bg-[#FFEA9E]",
        status === "fail" && priority === "low" && "bg-[#FFEA9E]",
        status === "warning" && "bg-[#FFEA9E]",
        className,
      )}
    >
      {label}
    </span>
  );
}
