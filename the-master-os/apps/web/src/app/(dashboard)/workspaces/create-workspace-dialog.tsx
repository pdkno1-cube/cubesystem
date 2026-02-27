'use client';

import { useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2,
  Truck,
  Monitor,
  UtensilsCrossed,
  ShoppingCart,
  Megaphone,
  Landmark,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { cn } from '@/lib/utils';
import {
  WORKSPACE_CATEGORIES,
  WORKSPACE_ICONS,
  type WorkspaceIcon,
} from '@/types/workspace';

// ── Schema ─────────────────────────────────────────────────────────

const createFormSchema = z.object({
  name: z
    .string()
    .min(1, '워크스페이스 이름은 필수입니다.')
    .max(100, '이름은 100자 이하여야 합니다.'),
  description: z.string().max(500).optional(),
  category: z
    .enum(['logistics', 'it', 'fnb', 'ecommerce', 'marketing', 'finance', 'other'])
    .default('other'),
  icon: z
    .enum([
      'Building2',
      'Truck',
      'Monitor',
      'UtensilsCrossed',
      'ShoppingCart',
      'Megaphone',
      'Landmark',
      'Briefcase',
    ])
    .default('Building2'),
});

type CreateFormValues = z.infer<typeof createFormSchema>;

// ── Icon map ───────────────────────────────────────────────────────

const ICON_COMPONENTS: Record<WorkspaceIcon, LucideIcon> = {
  Building2,
  Truck,
  Monitor,
  UtensilsCrossed,
  ShoppingCart,
  Megaphone,
  Landmark,
  Briefcase,
};

const ICON_LABELS: Record<WorkspaceIcon, string> = {
  Building2: '빌딩',
  Truck: '물류',
  Monitor: 'IT',
  UtensilsCrossed: 'F&B',
  ShoppingCart: '이커머스',
  Megaphone: '마케팅',
  Landmark: '금융',
  Briefcase: '비즈니스',
};

// ── Component ──────────────────────────────────────────────────────

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const { createWorkspace } = useWorkspaceStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'other',
      icon: 'Building2',
    },
  });

  const selectedIcon = watch('icon');

  const onSubmit = useCallback(
    async (data: CreateFormValues) => {
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        await createWorkspace({
          name: data.name,
          description: data.description,
          category: data.category,
          icon: data.icon,
        });
        reset();
        onCreated();
      } catch (err) {
        Sentry.captureException(err, { tags: { context: 'workspaces.create' } });
        const message =
          err instanceof Error
            ? err.message
            : '워크스페이스 생성에 실패했습니다.';
        setSubmitError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [createWorkspace, onCreated, reset],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset();
        setSubmitError(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>새 법인 생성</DialogTitle>
          <DialogDescription>
            새로운 법인 워크스페이스를 생성합니다. 에이전트를 할당하고 파이프라인을
            실행할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
          {/* Name */}
          <Input
            label="워크스페이스 이름"
            placeholder="예: 엉클로지텍"
            error={errors.name?.message}
            {...register('name')}
          />

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="description"
              className="text-sm font-medium text-gray-700"
            >
              설명
            </label>
            <textarea
              id="description"
              rows={3}
              className={cn(
                'flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
                'placeholder:text-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
                'disabled:cursor-not-allowed disabled:opacity-50',
                errors.description && 'border-red-500',
              )}
              placeholder="워크스페이스에 대한 간략한 설명"
              {...register('description')}
            />
            {errors.description?.message ? (
              <p className="text-xs text-red-600">
                {errors.description.message}
              </p>
            ) : null}
          </div>

          {/* Category */}
          <Select
            label="업종 카테고리"
            options={WORKSPACE_CATEGORIES.map((c) => ({
              value: c.value,
              label: c.label,
            }))}
            error={errors.category?.message}
            {...register('category')}
          />

          {/* Icon Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">아이콘</span>
            <div className="grid grid-cols-4 gap-2">
              {WORKSPACE_ICONS.map((iconName) => {
                const IconComp = ICON_COMPONENTS[iconName];
                const isSelected = selectedIcon === iconName;

                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setValue('icon', iconName)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-colors',
                      isSelected
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50',
                    )}
                    aria-label={ICON_LABELS[iconName]}
                  >
                    <IconComp className="h-5 w-5" />
                    <span className="text-[10px]">
                      {ICON_LABELS[iconName]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          {/* Actions */}
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              생성
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
