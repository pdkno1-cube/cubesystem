import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-16 text-center',
        className,
      )}
    >
      <Icon className="h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-sm font-medium text-gray-600">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-400">{description}</p>
      {action ? (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
