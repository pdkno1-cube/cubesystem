'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  ShieldCheck,
  Clock,
  Building2,
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
}

function SecretCard({ secret, onDelete }: SecretCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-gray-400" />
            <CardTitle className="text-base">{secret.name}</CardTitle>
          </div>
          <Badge variant={CATEGORY_BADGE_VARIANT[secret.category]}>
            {CATEGORY_LABELS[secret.category]}
          </Badge>
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
              ••••••••
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
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(secret)}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
          삭제
        </Button>
      </CardFooter>
    </Card>
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName('');
    setCategory('api_key');
    setWorkspaceId('');
    setValue('');
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
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          workspace_id: workspaceId,
          value: value.trim(),
        }),
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
    } catch {
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
    } catch {
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
      const message =
        err instanceof Error ? err.message : '시크릿 삭제에 실패했습니다.';
      setFetchError(message);
    } finally {
      setIsDeleting(false);
    }
  };

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
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          시크릿 추가
        </Button>
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

      {/* Create Dialog */}
      <CreateSecretDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaces={workspaces}
        onCreated={handleCreated}
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
