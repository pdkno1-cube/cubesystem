CREATE TABLE IF NOT EXISTS mcp_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('degraded', 'down', 'recovered')),
  message TEXT,
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mcp_health_alerts_service ON mcp_health_alerts(service_name, created_at DESC);

-- RLS
ALTER TABLE mcp_health_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON mcp_health_alerts FOR ALL USING (true) WITH CHECK (true);
