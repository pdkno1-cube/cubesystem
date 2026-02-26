import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 원형 스켈레톤 여부 (아바타 등) */
  circle?: boolean;
}

export function Skeleton({ className, circle = false, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gray-200",
        circle ? "rounded-full" : "rounded-lg",
        className,
      )}
      {...props}
    />
  );
}
