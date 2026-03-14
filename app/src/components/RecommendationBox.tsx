import { useState, useCallback } from "react";
import { Copy, RefreshCw, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendationBoxProps {
  label: string;
  value: string;
  onRegenerate: () => Promise<string>;
  onToast: (message: string) => void;
  className?: string;
}

export function RecommendationBox({
  label,
  value,
  onRegenerate,
  onToast,
  className,
}: RecommendationBoxProps) {
  const [text, setText] = useState(value);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    onToast("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }, [text, onToast]);

  const handleRegenerate = useCallback(async () => {
    setLoading(true);
    try {
      const newText = await onRegenerate();
      setText(newText);
      onToast("Recommendation regenerated");
    } catch (err) {
      console.error("[RecommendationBox] Regenerate failed:", err);
      onToast("Failed to regenerate");
    } finally {
      setLoading(false);
    }
  }, [onRegenerate, onToast]);

  return (
    <div className={cn("rounded-card bg-bg-700 p-4", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-body-12 uppercase tracking-wider text-text-secondary">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="rounded-full p-1.5 text-text-secondary hover:bg-bg-500 hover:text-white transition-colors"
            title="Copy"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="rounded-full p-1.5 text-text-secondary hover:bg-bg-500 hover:text-white transition-colors disabled:opacity-50"
            title="Regenerate"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </button>
        </div>
      </div>
      <p className="text-body-16 text-text-primary">{text}</p>
    </div>
  );
}
