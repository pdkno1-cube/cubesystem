'use client';

import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import {
  KeyRound,
  Plus,
  Trash2,
  ShieldCheck,
  Clock,
  Building2,
  Eye,
  Pencil,
  RotateCw,
  AlertTriangle,
  Calendar,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { McpProviderSection } from '@/components/mcp/McpProviderSection';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

// ── Types ──────────────────────────────────────────────────────────

interface VaultSecret {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  key_version: number;
  category:
    | 'api_key'
    | 'oauth_token'
    | 'password'
    | 'certificate'
    | 'webhook_secret'
    | 'other';
  expires_at: string | null;
  last_rotated_at: string | null;
  last_accessed_at: string | null;
  auto_rotation: boolean;
  rotation_interval_days: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  workspace_name?: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface ApiError {
  error: { code: string; message: string };
}

// ── Constants ──────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'api_key', label: 'API Key' },
  { value: 'oauth_token', label: 'OAuth Token' },
  { value: 'password', label: 'Password' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'webhook_secret', label: 'Webhook Secret' },
  { value: 'other', label: 'Other' },
] as const;

const CATEGORY_BADGE_VARIANT: Record<
  VaultSecret['category'],
  'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
> = {
  api_key: 'primary',
  oauth_token: 'info',
  password: 'danger',
  certificate: 'success',
  webhook_secret: 'warning',
  other: 'default',
};

const CATEGORY_LABELS: Record<VaultSecret['category'], string> = {
  api_key: 'API Key',
  oauth_token: 'OAuth',
  password: 'Password',
  certificate: 'Certificate',
  webhook_secret: 'Webhook',
  other: 'Other',
};

const EXPIRY_WARNING_DAYS = 7;

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return '-';
  }
}

function getDaysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) {
    return null;
  }
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getNextRotationDate(secret: VaultSecret): string | null {
  if (!secret.auto_rotation) {
    return null;
  }
  const baseDate = secret.last_rotated_at ?? secret.created_at;
  const next = new Date(baseDate);
  next.setDate(next.getDate() + secret.rotation_interval_days);
  return next.toISOString();
}

function isExpiringSoon(secret: VaultSecret): boolean {
  const days = getDaysUntilExpiry(secret.expires_at);
  return days !== null && days <= EXPIRY_WARNING_DAYS && days > 0;
}

function isExpired(secret: VaultSecret): boolean {
  const days = getDaysUntilExpiry(secret.expires_at);
  return days !== null && days <= 0;
}

// ── Loading Skeleton ───────────────────────────────────────────────

function VaultSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={`skeleton-${i}`}>
          <CardHeader>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-8 w-20" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ── Secret Card ────────────────────────────────────────────────────

interface SecretCardProps {
  secret: VaultSecret;
  onDelete: (secret: VaultSecret) => void;
  onView: (secret: VaultSecret) => void;
  onEdit: (secret: VaultSecret) => void;
  onRotate: (secret: VaultSecret) => void;
}

function SecretCard({ secret, onDelete, onView, onEdit, onRotate }: SecretCardProps) {
  const expiringSoon = isExpiringSoon(secret);
  const expired = isExpired(secret);
  const nextRotation = getNextRotationDate(secret);

  return (
    <Card className={expired ? 'border-red-300 bg-red-50/30' : expiringSoon ? 'border-yellow-300 bg-yellow-50/30' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gray-400" />
            <CardTitle className="text-base">{secret.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {expired ? (
              <Badge variant="danger">만료됨</Badge>
            ) : expiringSoon ? (
              <Badge variant="warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {getDaysUntilExpiry(secret.expires_at)}일 남음
              </Badge>
            ) : null}
            <Badge variant={CATEGORY_BADGE_VARIANT[secret.category]}>
              {CATEGORY_LABELS[secret.category]}
            </Badge>
          </div>
        </div>
        <CardDescription className="flex items-center gap-1 pt-1">
          <Building2 className="h-3.5 w-3.5" />
          {secret.workspace_name ?? '알 수 없음'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">값</span>
            <span className="font-mono tracking-widest text-gray-700">
              {'*'.repeat(12)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-gray-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              키 버전
            </span>
            <span className="text-gray-700">v{secret.key_version}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-gray-500">
              <Clock className="h-3.5 w-3.5" />
              마지막 로테이션
            </span>
            <span className="text-gray-700">
              {formatDate(secret.last_rotated_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-gray-500">
              <Eye className="h-3.5 w-3.5" />
              마지막 접근
            </span>
            <span className="text-gray-700">
              {formatDate(secret.last_accessed_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              만료일
            </span>
            <span className={`text-gray-700 ${expired ? 'text-red-600 font-medium' : expiringSoon ? 'text-yellow-600 font-medium' : ''}`}>
              {formatDate(secret.expires_at)}
            </span>
          </div>
          {secret.auto_rotation ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-gray-500">
                <RotateCw className="h-3.5 w-3.5" />
                다음 로테이션
              </span>
              <span className="text-gray-700">
                {formatDate(nextRotation)}
              </span>
            </div>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <div className="flex items-center gap-1">
          {secret.auto_rotation ? (
            <Badge variant="success">자동 로테이션</Badge>
          ) : (
            <Badge variant="default">수동 로테이션</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onView(secret)}
            className="text-gray-600 hover:bg-gray-100"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(secret)}
            className="text-gray-600 hover:bg-gray-100"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRotate(secret)}
            className="text-blue-600 hover:bg-blue-50"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(secret)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

// ── View Secret Dialog ─────────────────────────────────────────────

interface ViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: VaultSecret | null;
}

function ViewSecretDialog({ open, onOpenChange, secret }: ViewDialogProps) {
  if (!secret) {
    return null;
  }

  const nextRotation = getNextRotationDate(secret);
  const daysUntilExpiry = getDaysUntilExpiry(secret.expires_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시크릿 상세</DialogTitle>
          <DialogDescription>
            {secret.name} 시크릿의 상세 정보입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">이름</span>
              <p className="font-medium text-gray-900">{secret.name}</p>
            </div>
            <div>
              <span className="text-gray-500">카테고리</span>
              <p>
                <Badge variant={CATEGORY_BADGE_VARIANT[secret.category]}>
                  {CATEGORY_LABELS[secret.category]}
                </Badge>
              </p>
            </div>
            <div>
              <span className="text-gray-500">워크스페이스</span>
              <p className="font-medium text-gray-900">{secret.workspace_name ?? '알 수 없음'}</p>
            </div>
            <div>
              <span className="text-gray-500">키 버전</span>
              <p className="font-medium text-gray-900">v{secret.key_version}</p>
            </div>
            <div>
              <span className="text-gray-500">값 (마스킹)</span>
              <p className="font-mono tracking-widest text-gray-700">
                {'*'.repeat(16)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">슬러그</span>
              <p className="font-mono text-xs text-gray-600">{secret.slug}</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">생성일</span>
              <p className="text-gray-700">{formatDate(secret.created_at)}</p>
            </div>
            <div>
              <span className="text-gray-500">수정일</span>
              <p className="text-gray-700">{formatDate(secret.updated_at)}</p>
            </div>
            <div>
              <span className="text-gray-500">마지막 접근</span>
              <p className="text-gray-700">{formatDate(secret.last_accessed_at)}</p>
            </div>
            <div>
              <span className="text-gray-500">마지막 로테이션</span>
              <p className="text-gray-700">{formatDate(secret.last_rotated_at)}</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">만료일</span>
              <p className={`font-medium ${daysUntilExpiry !== null && daysUntilExpiry <= 0 ? 'text-red-600' : daysUntilExpiry !== null && daysUntilExpiry <= EXPIRY_WARNING_DAYS ? 'text-yellow-600' : 'text-gray-700'}`}>
                {formatDate(secret.expires_at)}
                {daysUntilExpiry !== null ? (
                  <span className="ml-1 text-xs">
                    ({daysUntilExpiry <= 0 ? '만료됨' : `${daysUntilExpiry}일 남음`})
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <span className="text-gray-500">자동 로테이션</span>
              <p className="font-medium text-gray-700">
                {secret.auto_rotation
                  ? `활성 (${secret.rotation_interval_days}일 주기)`
                  : '비활성'}
              </p>
            </div>
            {secret.auto_rotation ? (
              <div className="col-span-2">
                <span className="text-gray-500">다음 로테이션 예정일</span>
                <p className="font-medium text-gray-700">{formatDate(nextRotation)}</p>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create Secret Dialog ───────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
  onCreated: (secret: VaultSecret) => void;
}

function CreateSecretDialog({
  open,
  onOpenChange,
  workspaces,
  onCreated,
}: CreateDialogProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('api_key');
  const [workspaceId, setWorkspaceId] = useState('');
  const [value, setValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setCategory('api_key');
    setWorkspaceId('');
    setValue('');
    setExpiresAt('');
    setFormError(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('시크릿 이름을 입력해주세요.');
      return;
    }
    if (!workspaceId) {
      setFormError('워크스페이스를 선택해주세요.');
      return;
    }
    if (!value.trim()) {
      setFormError('시크릿 값을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Record<string, string> = {
        name: name.trim(),
        category,
        workspace_id: workspaceId,
        value: value.trim(),
      };

      if (expiresAt) {
        payload.expires_at = new Date(expiresAt).toISOString();
      }

      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = (await res.json()) as ApiError;
        setFormError(errBody.error?.message ?? '시크릿 생성에 실패했습니다.');
        return;
      }

      const result = (await res.json()) as { data: VaultSecret };
      onCreated(result.data);
      resetForm();
      onOpenChange(false);
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'vault.secret.create' } });
      setFormError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const workspaceOptions = workspaces.map((ws) => ({
    value: ws.id,
    label: ws.name,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시크릿 추가</DialogTitle>
          <DialogDescription>
            API 키, 토큰 등 민감한 정보를 안전하게 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="이름"
            placeholder="예: OpenAI API Key"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Select
            label="카테고리"
            options={[...CATEGORY_OPTIONS]}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />

          <Select
            label="워크스페이스"
            options={workspaceOptions}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="워크스페이스를 선택하세요"
          />

          <Input
            label="시크릿 값"
            type="password"
            placeholder="sk-..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            autoComplete="off"
          />

          <Input
            label="만료일 (선택)"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />

          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              취소
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              <Plus className="h-4 w-4" />
              추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Secret Dialog ─────────────────────────────────────────────

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: VaultSecret | null;
  onUpdated: (secret: VaultSecret) => void;
}

function EditSecretDialog({
  open,
  onOpenChange,
  secret,
  onUpdated,
}: EditDialogProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [newValue, setNewValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [autoRotation, setAutoRotation] = useState(false);
  const [rotationDays, setRotationDays] = useState('90');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (secret) {
      setName(secret.name);
      setCategory(secret.category);
      setNewValue('');
      setExpiresAt(
        secret.expires_at
          ? new Date(secret.expires_at).toISOString().slice(0, 10)
          : '',
      );
      setAutoRotation(secret.auto_rotation);
      setRotationDays(String(secret.rotation_interval_days));
      setFormError(null);
      setShowAdvanced(false);
    }
  }, [secret]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) {
      return;
    }
    setFormError(null);

    const payload: Record<string, unknown> = {};
    let hasChanges = false;

    if (name.trim() && name.trim() !== secret.name) {
      payload.name = name.trim();
      hasChanges = true;
    }
    if (category && category !== secret.category) {
      payload.category = category;
      hasChanges = true;
    }
    if (newValue.trim()) {
      payload.value = newValue.trim();
      hasChanges = true;
    }

    const newExpiresAt = expiresAt
      ? new Date(expiresAt).toISOString()
      : null;
    const currentExpiresAt = secret.expires_at
      ? new Date(secret.expires_at).toISOString()
      : null;
    if (newExpiresAt !== currentExpiresAt) {
      payload.expires_at = newExpiresAt;
      hasChanges = true;
    }

    if (autoRotation !== secret.auto_rotation) {
      payload.auto_rotation = autoRotation;
      hasChanges = true;
    }

    const parsedDays = parseInt(rotationDays, 10);
    if (!isNaN(parsedDays) && parsedDays !== secret.rotation_interval_days) {
      payload.rotation_interval_days = parsedDays;
      hasChanges = true;
    }

    if (!hasChanges) {
      setFormError('변경된 항목이 없습니다.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/vault/${secret.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = (await res.json()) as ApiError;
        setFormError(errBody.error?.message ?? '시크릿 수정에 실패했습니다.');
        return;
      }

      const result = (await res.json()) as { data: VaultSecret };
      onUpdated(result.data);
      onOpenChange(false);
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'vault.secret.edit' } });
      setFormError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!secret) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시크릿 수정</DialogTitle>
          <DialogDescription>
            {secret.name} 시크릿의 정보를 수정합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Select
            label="카테고리"
            options={[...CATEGORY_OPTIONS]}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />

          <Input
            label="새 시크릿 값 (변경 시에만 입력)"
            type="password"
            placeholder="새 값을 입력하면 로테이션됩니다"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            autoComplete="off"
          />

          <Input
            label="만료일"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />

          {/* Advanced: Auto-rotation settings */}
          <button
            type="button"
            className="flex w-full items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            자동 로테이션 설정
          </button>

          {showAdvanced ? (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">자동 로테이션</span>
                <button
                  type="button"
                  onClick={() => setAutoRotation(!autoRotation)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  {autoRotation ? (
                    <ToggleRight className="h-7 w-7 text-green-600" />
                  ) : (
                    <ToggleLeft className="h-7 w-7 text-gray-400" />
                  )}
                </button>
              </div>
              {autoRotation ? (
                <Input
                  label="로테이션 주기 (일)"
                  type="number"
                  min="1"
                  max="365"
                  value={rotationDays}
                  onChange={(e) => setRotationDays(e.target.value)}
                />
              ) : null}
            </div>
          ) : null}

          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              <Pencil className="h-4 w-4" />
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Rotate Secret Dialog ───────────────────────────────────────────

interface RotateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: VaultSecret | null;
  onRotated: (secret: VaultSecret) => void;
}

function RotateSecretDialog({
  open,
  onOpenChange,
  secret,
  onRotated,
}: RotateDialogProps) {
  const [newValue, setNewValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (secret) {
      setNewValue('');
      setFormError(null);
    }
  }, [secret]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) {
      return;
    }

    if (!newValue.trim()) {
      setFormError('새 시크릿 값을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/vault/${secret.id}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_value: newValue.trim() }),
      });

      if (!res.ok) {
        const errBody = (await res.json()) as ApiError;
        setFormError(errBody.error?.message ?? '로테이션에 실패했습니다.');
        return;
      }

      const result = (await res.json()) as { data: VaultSecret };
      onRotated(result.data);
      onOpenChange(false);
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'vault.secret.rotate' } });
      setFormError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!secret) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시크릿 로테이션</DialogTitle>
          <DialogDescription>
            <strong>{secret.name}</strong>의 값을 새로 교체합니다.
            현재 버전: v{secret.key_version}
          </DialogDescription>
        </DialogHeader>

        {/* Rotation history */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <h4 className="mb-2 font-medium text-gray-700">로테이션 이력</h4>
          <div className="space-y-1 text-gray-600">
            <div className="flex justify-between">
              <span>현재 버전</span>
              <span className="font-mono">v{secret.key_version}</span>
            </div>
            <div className="flex justify-between">
              <span>마지막 로테이션</span>
              <span>{formatDate(secret.last_rotated_at)}</span>
            </div>
            {secret.auto_rotation ? (
              <div className="flex justify-between">
                <span>다음 예정일</span>
                <span>{formatDate(getNextRotationDate(secret))}</span>
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="새 시크릿 값"
            type="password"
            placeholder="새 값을 입력하세요"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            required
            autoComplete="off"
          />

          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              <RotateCw className="h-4 w-4" />
              로테이션 실행
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Confirmation Dialog ─────────────────────────────────────

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: VaultSecret | null;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  secret,
  onConfirm,
  isDeleting,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>시크릿 삭제</DialogTitle>
          <DialogDescription>
            <strong>{secret?.name}</strong> 시크릿을 삭제하시겠습니까?
            이 작업은 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            isLoading={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page Component ────────────────────────────────────────────

export default function VaultPage() {
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<VaultSecret | null>(null);
  const [editTarget, setEditTarget] = useState<VaultSecret | null>(null);
  const [rotateTarget, setRotateTarget] = useState<VaultSecret | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultSecret | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Fetch secrets ──────────────────────────────────────────────

  const fetchSecrets = useCallback(async () => {
    try {
      const res = await fetch('/api/vault');
      if (!res.ok) {
        const errBody = (await res.json()) as ApiError;
        throw new Error(errBody.error?.message ?? '시크릿 목록 조회 실패');
      }
      const result = (await res.json()) as { data: VaultSecret[]; total: number };
      setSecrets(result.data);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'vault.secrets.fetch' } });
      const message =
        err instanceof Error ? err.message : '시크릿 목록을 불러올 수 없습니다.';
      setFetchError(message);
    }
  }, []);

  // ── Fetch workspaces ───────────────────────────────────────────

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) {
        return;
      }
      const result = (await res.json()) as {
        data: Array<{ id: string; name: string }>;
      };
      setWorkspaces(
        result.data.map((ws) => ({ id: ws.id, name: ws.name })),
      );
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'vault.workspaces.fetch' } });
      // Workspace fetch failure is non-critical; create dialog will show empty list
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchSecrets(), fetchWorkspaces()]);
      setIsLoading(false);
    };
    void init();
  }, [fetchSecrets, fetchWorkspaces]);

  // ── Handlers ───────────────────────────────────────────────────

  const handleCreated = (newSecret: VaultSecret) => {
    setSecrets((prev) => [newSecret, ...prev]);
  };

  const handleUpdated = (updated: VaultSecret) => {
    setSecrets((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
    );
  };

  const handleRotated = (rotated: VaultSecret) => {
    setSecrets((prev) =>
      prev.map((s) => (s.id === rotated.id ? { ...s, ...rotated } : s)),
    );
  };

  const handleViewRequest = (secret: VaultSecret) => {
    setViewTarget(secret);
    // Fetch individual secret to update last_accessed_at
    void fetch(`/api/vault/${secret.id}`).catch(() => {
      // Non-critical, just updating last_accessed_at
    });
  };

  const handleEditRequest = (secret: VaultSecret) => {
    setEditTarget(secret);
  };

  const handleRotateRequest = (secret: VaultSecret) => {
    setRotateTarget(secret);
  };

  const handleDeleteRequest = (secret: VaultSecret) => {
    setDeleteTarget(secret);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/vault/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errBody = (await res.json()) as ApiError;
        throw new Error(errBody.error?.message ?? '삭제 실패');
      }

      setSecrets((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      Sentry.captureException(err, { tags: { context: 'vault.secret.delete' } });
      const message =
        err instanceof Error ? err.message : '시크릿 삭제에 실패했습니다.';
      setFetchError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Count expiring secrets
  const expiringCount = secrets.filter(
    (s) => isExpiringSoon(s) || isExpired(s),
  ).length;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            시크릿 볼트
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            API 키와 자격증명을 안전하게 관리합니다
          </p>
        </div>
        <div className="flex items-center gap-3">
          {expiringCount > 0 ? (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" />
              {expiringCount}개 만료 임박
            </Badge>
          ) : null}
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            시크릿 추가
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {fetchError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {fetchError}
          <button
            type="button"
            className="ml-2 font-medium underline"
            onClick={() => {
              setFetchError(null);
              void fetchSecrets();
            }}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {/* Loading state */}
      {isLoading ? <VaultSkeleton /> : null}

      {/* Empty state */}
      {!isLoading && secrets.length === 0 && !fetchError ? (
        <EmptyState
          icon={KeyRound}
          title="등록된 시크릿이 없습니다"
          description="API 키, 토큰 등을 안전하게 저장하고 관리하세요."
          action={{
            label: '시크릿 추가',
            onClick: () => setCreateOpen(true),
          }}
        />
      ) : null}

      {/* Secret list */}
      {!isLoading && secrets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {secrets.map((secret) => (
            <SecretCard
              key={secret.id}
              secret={secret}
              onDelete={handleDeleteRequest}
              onView={handleViewRequest}
              onEdit={handleEditRequest}
              onRotate={handleRotateRequest}
            />
          ))}
        </div>
      ) : null}

      {/* MCP Provider Integration Section */}
      {!isLoading && workspaces.length > 0 ? (
        <div className="border-t pt-6">
          <McpProviderSection
            workspaceId={workspaces[0]?.id ?? ''}
            vaultSecrets={secrets.map((s) => ({
              id: s.id,
              name: s.name,
              slug: s.slug,
              category: s.category,
            }))}
          />
        </div>
      ) : null}

      {/* View Dialog */}
      <ViewSecretDialog
        open={viewTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewTarget(null);
          }
        }}
        secret={viewTarget}
      />

      {/* Create Dialog */}
      <CreateSecretDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaces={workspaces}
        onCreated={handleCreated}
      />

      {/* Edit Dialog */}
      <EditSecretDialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
          }
        }}
        secret={editTarget}
        onUpdated={handleUpdated}
      />

      {/* Rotate Dialog */}
      <RotateSecretDialog
        open={rotateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRotateTarget(null);
          }
        }}
        secret={rotateTarget}
        onRotated={handleRotated}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        secret={deleteTarget}
        onConfirm={() => void handleDeleteConfirm()}
        isDeleting={isDeleting}
      />
    </div>
  );
}
