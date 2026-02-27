"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  /** Color variant based on progress level */
  variant?: "default" | "warning" | "danger";
}

const VARIANT_CLASSES = {
  default: "bg-brand-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
} as const;

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, variant = "default", ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cn(
          "h-2.5 w-full overflow-hidden rounded-full bg-gray-100",
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            VARIANT_CLASSES[variant],
          )}
          style={{ width: `${String(percentage)}%` }}
        />
      </div>
    );
  },
);

Progress.displayName = "Progress";

export { Progress };
