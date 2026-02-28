-- workspace_pipelines: assigns pipelines to workspaces
create table if not exists workspace_pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique(workspace_id, pipeline_id)
);

alter table workspace_pipelines enable row level security;

create policy "authenticated can manage workspace_pipelines"
  on workspace_pipelines for all to authenticated
  using (true) with check (true);

create index if not exists idx_workspace_pipelines_workspace_id
  on workspace_pipelines(workspace_id);
create index if not exists idx_workspace_pipelines_pipeline_id
  on workspace_pipelines(pipeline_id);
