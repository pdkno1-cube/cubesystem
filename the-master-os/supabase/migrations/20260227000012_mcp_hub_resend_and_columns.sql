-- Migration: MCP Hub — add resend provider + test_result tracking
-- Phase 5 Session 1

-- 1. Drop the existing CHECK constraint on provider and recreate with 'resend' included
--    PostgreSQL doesn't support ALTER CONSTRAINT directly, so we drop+add.
ALTER TABLE mcp_connections
  DROP CONSTRAINT IF EXISTS mcp_connections_provider_check;

ALTER TABLE mcp_connections
  ADD CONSTRAINT mcp_connections_provider_check
  CHECK (provider IN (
    'firecrawl', 'paddleocr', 'google_drive',
    'figma', 'slack', 'resend', 'custom'
  ));

-- 2. Add test_result column for storing the last connection test response
ALTER TABLE mcp_connections
  ADD COLUMN IF NOT EXISTS test_result JSONB;

-- Index for provider + workspace queries (used by MCP hub list endpoint)
CREATE INDEX IF NOT EXISTS idx_mcp_workspace_provider
  ON mcp_connections(workspace_id, provider)
  WHERE deleted_at IS NULL;

-- 3. Ensure secret_vault has a name-based unique index for the MCP hub upsert pattern
--    (already exists, but guard with IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sv_workspace_name
  ON secret_vault(workspace_id, name)
  WHERE deleted_at IS NULL;
