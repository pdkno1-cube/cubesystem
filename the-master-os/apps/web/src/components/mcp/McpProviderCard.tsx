'use client';

import {
  Mail,
  HardDrive,
  MessageCircle,
  Globe,
  FileScan,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  LinkIcon,
  Unlink,
  FlaskConical,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderStatus {
  provider: string;
  label: string;
  description: string;
  icon: string;
  required_secret: string;
  connection_id: string | null;
  secret_ref: string | null;
  health_status: string;
  last_health_check: string | null;
  test_result: Record<string, unknown> | null;
  is_connected: boolean;
}

interface McpProviderCardProps {
  provider: ProviderStatus;
  onConnect: (provider: ProviderStatus) => void;
  onDisconnect: (provider: ProviderStatus) => void;
  onTest: (provider: ProviderStatus) => void;
  isTesting: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  mail: Mail,
  'hard-drive': HardDrive,
  'message-circle': MessageCircle,
  globe: Globe,
  'file-scan': FileScan,
};

function HealthBadge({ status }: { status: string }) {
  if (status === 'healthy') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        연결됨
      </Badge>
    );
  }
  if (status === 'not_connected') {
    return (
      <Badge variant="default" className="gap-1">
        <XCircle className="h-3 w-3" />
        미연결
      </Badge>
    );
  }
  if (status === 'down') {
    return (
      <Badge variant="danger" className="gap-1">
        <XCircle className="h-3 w-3" />
        연결 오류
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1">
      <HelpCircle className="h-3 w-3" />
      확인 필요
    </Badge>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return '-';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function McpProviderCard({
  provider,
  onConnect,
  onDisconnect,
  onTest,
  isTesting,
}: McpProviderCardProps) {
  const Icon = ICON_MAP[provider.icon] ?? Globe;

  return (
    <Card className={provider.is_connected ? 'border-green-200 bg-green-50/30' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                provider.is_connected ? 'bg-green-100' : 'bg-gray-100'
              }`}
            >
              <Icon
                className={`h-5 w-5 ${provider.is_connected ? 'text-green-600' : 'text-gray-500'}`}
              />
            </div>
            <div>
              <CardTitle className="text-base">{provider.label}</CardTitle>
            </div>
          </div>
          <HealthBadge status={provider.health_status} />
        </div>
        <CardDescription className="mt-2 text-sm">{provider.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-1.5 text-xs text-gray-500">
          <div className="flex items-start gap-1">
            <span className="font-medium text-gray-600">필요한 키:</span>
            <span>{provider.required_secret}</span>
          </div>
          {provider.is_connected && (
            <div className="flex items-start gap-1">
              <span className="font-medium text-gray-600">마지막 테스트:</span>
              <span>{formatDate(provider.last_health_check)}</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        {provider.is_connected ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onTest(provider)}
              disabled={isTesting}
              className="gap-1.5"
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FlaskConical className="h-3.5 w-3.5" />
              )}
              테스트
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDisconnect(provider)}
              className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Unlink className="h-3.5 w-3.5" />
              연결 해제
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => onConnect(provider)}
            className="gap-1.5"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            연결하기
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
