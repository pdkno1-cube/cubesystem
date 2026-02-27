'use client';

import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';
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
import type { ProviderStatus } from './McpProviderCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VaultSecret {
  id: string;
  name: string;
  slug: string;
  category: string;
}

interface ConnectProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderStatus | null;
  workspaceId: string;
  vaultSecrets: VaultSecret[];
  onConnected: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectProviderModal({
  open,
  onOpenChange,
  provider,
  workspaceId,
  vaultSecrets,
  onConnected,
}: ConnectProviderModalProps) {
  const [secretId, setSecretId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const secretOptions = vaultSecrets.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.category})`,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!secretId) {
      setFormError('시크릿을 선택해주세요.');
      return;
    }
    if (!connectionName.trim()) {
      setFormError('연결 이름을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/mcp/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          provider: provider?.provider,
          secret_ref: secretId,
          name: connectionName.trim(),
          endpoint_url: endpointUrl.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: { message?: string } };
        setFormError(err.error?.message ?? '연결에 실패했습니다.');
        return;
      }

      setSecretId('');
      setConnectionName('');
      setEndpointUrl('');
      onOpenChange(false);
      onConnected();
    } catch (error) {
      Sentry.captureException(error, { tags: { context: 'mcp.provider.connect' } });
      setFormError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSecretId('');
    setConnectionName('');
    setEndpointUrl('');
    setFormError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider?.label} 연결</DialogTitle>
          <DialogDescription>
            볼트에 저장된 API 키를 선택하여 <strong>{provider?.label}</strong>를 연결합니다.
            <br />
            <span className="mt-1 block text-xs text-gray-500">
              필요한 키: {provider?.required_secret}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="연결 이름"
            placeholder={`예: ${provider?.label} Production`}
            value={connectionName}
            onChange={(e) => setConnectionName(e.target.value)}
            required
          />

          {vaultSecrets.length > 0 ? (
            <Select
              label="API 키 (볼트에서 선택)"
              options={secretOptions}
              value={secretId}
              onChange={(e) => setSecretId(e.target.value)}
              placeholder="시크릿을 선택하세요"
            />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              볼트에 저장된 시크릿이 없습니다.{' '}
              <a href="/vault" className="font-medium underline">
                볼트 페이지
              </a>
              에서 먼저 API 키를 추가해주세요.
            </div>
          )}

          {(provider?.provider === 'paddleocr' || endpointUrl) && (
            <Input
              label="엔드포인트 URL (선택)"
              placeholder="https://api.example.com"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
          )}

          {formError ? (
            <p className="text-sm text-red-600">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleClose}>
              취소
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={!secretId || vaultSecrets.length === 0}
            >
              연결
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
