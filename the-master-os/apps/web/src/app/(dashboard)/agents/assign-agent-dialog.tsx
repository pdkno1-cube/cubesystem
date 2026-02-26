'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Building2, ArrowRight } from 'lucide-react';
import { useAgentStore } from '@/stores/agent-store';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface AssignAgentDialogProps {
  open: boolean;
  agentId: string | null;
  workspaces: Workspace[];
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignAgentDialog({
  open,
  agentId,
  workspaces,
  onClose,
  onAssigned,
}: AssignAgentDialogProps) {
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { assignAgent } = useAgentStore();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!agentId || !selectedWorkspace) {return;}

      setIsSubmitting(true);

      try {
        await assignAgent(agentId, selectedWorkspace);
        setSelectedWorkspace('');
        onAssigned();
      } finally {
        setIsSubmitting(false);
      }
    },
    [agentId, selectedWorkspace, assignAgent, onAssigned]
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setSelectedWorkspace('');
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              워크스페이스 할당
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-sm text-gray-500">
            에이전트를 할당할 워크스페이스를 선택하세요. 이미 다른 워크스페이스에
            할당된 경우 자동으로 해제 후 재할당됩니다.
          </Dialog.Description>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="workspace-select"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                워크스페이스 선택
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <select
                  id="workspace-select"
                  value={selectedWorkspace}
                  onChange={(e) => setSelectedWorkspace(e.target.value)}
                  required
                  className="w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="" disabled>
                    워크스페이스를 선택하세요
                  </option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!selectedWorkspace || isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowRight className="h-4 w-4" />
                {isSubmitting ? '할당 중...' : '할당하기'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
