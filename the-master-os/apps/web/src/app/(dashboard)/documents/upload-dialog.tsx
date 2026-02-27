'use client';

import { useCallback, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Upload, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadDialogProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onUploaded: () => void;
}

const DOCUMENT_TYPES = [
  { value: 'general', label: '일반 문서' },
  { value: 'business_registration', label: '사업자등록증' },
  { value: 'tax_invoice', label: '세금계산서' },
  { value: 'bid_document', label: '입찰서류' },
  { value: 'contract', label: '계약서' },
  { value: 'financial_report', label: '재무제표' },
  { value: 'certificate', label: '인증서/자격증' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UploadDialog({
  isOpen,
  workspaceId,
  onClose,
  onUploaded,
}: UploadDialogProps) {
  const [documentName, setDocumentName] = useState('');
  const [documentType, setDocumentType] = useState('general');
  const [fileUrl, setFileUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const resetForm = useCallback(() => {
    setDocumentName('');
    setDocumentType('general');
    setFileUrl('');
    setErrorMessage('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!documentName.trim()) {
        setErrorMessage('문서 이름을 입력해주세요.');
        return;
      }

      setIsSubmitting(true);
      setErrorMessage('');

      try {
        const resp = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: workspaceId,
            document_name: documentName.trim(),
            document_type: documentType,
            file_url: fileUrl.trim() || undefined,
          }),
        });

        if (!resp.ok) {
          const body = await resp.json() as { error?: { message?: string } };
          setErrorMessage(body.error?.message ?? '업로드에 실패했습니다.');
          return;
        }

        resetForm();
        onUploaded();
        onClose();
      } catch (error) {
        Sentry.captureException(error, { tags: { context: 'documents.upload' } });
        setErrorMessage('네트워크 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [workspaceId, documentName, documentType, fileUrl, resetForm, onUploaded, onClose],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            handleClose();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="닫기"
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">문서 업로드</h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Document name */}
          <div>
            <label htmlFor="doc-name" className="block text-sm font-medium text-gray-700">
              문서 이름 <span className="text-red-500">*</span>
            </label>
            <input
              id="doc-name"
              type="text"
              value={documentName}
              onChange={(e) => { setDocumentName(e.target.value); }}
              placeholder="예: 사업자등록증_엉클로지텍.pdf"
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              maxLength={200}
              disabled={isSubmitting}
            />
          </div>

          {/* Document type */}
          <div>
            <label htmlFor="doc-type" className="block text-sm font-medium text-gray-700">
              문서 유형
            </label>
            <select
              id="doc-type"
              value={documentType}
              onChange={(e) => { setDocumentType(e.target.value); }}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              disabled={isSubmitting}
            >
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {/* File URL (optional) */}
          <div>
            <label htmlFor="file-url" className="block text-sm font-medium text-gray-700">
              파일 URL <span className="text-xs text-gray-400">(선택)</span>
            </label>
            <input
              id="file-url"
              type="url"
              value={fileUrl}
              onChange={(e) => { setFileUrl(e.target.value); }}
              placeholder="https://drive.google.com/..."
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              disabled={isSubmitting}
            />
          </div>

          {/* Error message */}
          {errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !documentName.trim()}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                isSubmitting || !documentName.trim()
                  ? 'cursor-not-allowed bg-brand-300'
                  : 'bg-brand-600 hover:bg-brand-700',
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              업로드
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
