"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlanCardProps {
  name: string;
  slug: string;
  priceUsd: number;
  creditsPerMonth: number;
  features: string[];
  isCurrent: boolean;
  isUpgrading: boolean;
  onSelect: (slug: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_COLORS: Record<string, { border: string; header: string; badge: string }> = {
  free: {
    border: "border-gray-200",
    header: "text-gray-900",
    badge: "bg-gray-100 text-gray-600",
  },
  pro: {
    border: "border-brand-300 ring-2 ring-brand-100",
    header: "text-brand-700",
    badge: "bg-brand-100 text-brand-700",
  },
  enterprise: {
    border: "border-purple-300 ring-2 ring-purple-100",
    header: "text-purple-700",
    badge: "bg-purple-100 text-purple-700",
  },
};

function formatPrice(price: number): string {
  if (price === 0) {
    return "무료";
  }
  return `$${String(price)}`;
}

function formatCredits(credits: number): string {
  if (credits < 0) {
    return "무제한";
  }
  return new Intl.NumberFormat("ko-KR").format(credits);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanCard({
  name,
  slug,
  priceUsd,
  creditsPerMonth,
  features,
  isCurrent,
  isUpgrading,
  onSelect,
}: PlanCardProps) {
  const defaultColors = { border: "border-gray-200", header: "text-gray-900", badge: "bg-gray-100 text-gray-600" };
  const colors = PLAN_COLORS[slug] ?? defaultColors;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        colors.border,
      )}
    >
      {/* Popular badge for Pro */}
      {slug === "pro" ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="primary" className="px-3 py-1 text-xs font-semibold">
            추천
          </Badge>
        </div>
      ) : null}

      {/* Plan header */}
      <div className="mb-4">
        <h3 className={cn("text-xl font-bold", colors.header)}>{name}</h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-gray-900">
            {formatPrice(priceUsd)}
          </span>
          {priceUsd > 0 ? (
            <span className="text-sm text-gray-500">/월</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {formatCredits(creditsPerMonth)} 크레딧/월
        </p>
      </div>

      {/* Features list */}
      <ul className="mb-6 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isCurrent ? (
        <Badge
          variant="success"
          className="w-full justify-center py-2.5 text-sm font-medium"
        >
          현재 플랜
        </Badge>
      ) : (
        <Button
          variant={slug === "pro" ? "primary" : "secondary"}
          size="md"
          className="w-full"
          isLoading={isUpgrading}
          disabled={isUpgrading}
          onClick={() => {
            onSelect(slug);
          }}
        >
          {priceUsd === 0 ? "다운그레이드" : "업그레이드"}
        </Button>
      )}
    </div>
  );
}
