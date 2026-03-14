import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-4">
        {label && (
          <label
            htmlFor={inputId}
            className="text-h2 text-text-primary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-[10px] border border-[#717171] bg-bg-500 p-[14px] text-body-16 text-text-primary placeholder:text-bg-300 outline-none focus:ring-1 focus:ring-accent-blue transition-shadow shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)]",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);

Input.displayName = "Input";
