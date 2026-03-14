import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryScore } from "@/types/seo";

interface SummaryCardProps {
  category: CategoryScore;
  onClick: () => void;
  className?: string;
}

export function SummaryCard({ category, onClick, className }: SummaryCardProps) {
  const { passed, total, checks } = category;
  const failed = total - passed;

  // Determine pill variant
  const allPassed = passed === total;
  const nonePassed = passed === 0;

  const pillBg = allPassed
    ? "bg-[#A2FFB4]"
    : nonePassed
      ? "bg-[#FF8484]"
      : "bg-[#FFDD64]";

  const pillShadow = allPassed
    ? "shadow-[0_2px_6.6px_0_rgba(72,201,133,0.30)]"
    : nonePassed
      ? "shadow-[0_2px_6.6px_0_rgba(255,100,100,0.30)]"
      : "shadow-[0_2px_6.6px_0_rgba(255,211,1,0.40)]";

  const iconBg = allPassed
    ? "bg-[#48C985]"
    : nonePassed
      ? "bg-[#FF6464]"
      : "bg-[#FFD301]";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-3 rounded-[14px] border-2 border-[#5b5959] bg-[#323232] pt-5 pb-[23px] px-6 text-left transition-colors hover:border-[#444]",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex w-full items-center justify-between pb-3">
        <span className="text-body-semibold text-text-primary">
          {category.label}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-[27px] border border-white/40 px-3 py-2 text-sm font-medium text-black",
              pillBg,
              pillShadow,
            )}
          >
            {passed}/{total} passed
          </span>
          <span
            className={cn(
              "flex h-[35px] w-[35px] items-center justify-center rounded-[27px] border border-white/40",
              iconBg,
              pillShadow,
            )}
          >
            <ArrowUpRight className="h-4 w-4 text-black" />
          </span>
        </div>
      </div>

      {/* Check items */}
      <div className="flex w-full flex-col gap-1.5">
        {checks.map((check) => (
          <div key={check.id} className="flex items-center gap-2 text-body">
            {check.status === "pass" ? (
              <span className="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-[#A2FFB4]" />
            ) : (
              <span className="inline-block w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-[#FF8484]" />
            )}
            <span
              className={cn(
                check.status === "pass" ? "text-text-secondary" : "text-text-primary",
              )}
            >
              {check.title}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
