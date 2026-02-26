import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANT_CLASSES = {
  default: 'bg-gray-100 text-gray-800',
  primary: 'bg-brand-100 text-brand-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
} as const;

type BadgeVariant = keyof typeof VARIANT_CLASSES;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
