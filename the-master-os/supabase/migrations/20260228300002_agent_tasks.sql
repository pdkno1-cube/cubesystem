-- agent_tasks: single execution record
create table if not exists agent_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  conversation_id uuid, -- FK added after agent_conversations
  input_text text not null,
  output_text text,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  tokens_input integer default 0,
  tokens_output integer default 0,
  cost_usd numeric(10,6) default 0,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- agent_conversations: multi-turn conversation session
create table if not exists agent_conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK from agent_tasks to agent_conversations
alter table agent_tasks
  add constraint agent_tasks_conversation_id_fkey
  foreign key (conversation_id) references agent_conversations(id) on delete set null;

-- agent_runs: multi-agent orchestration run
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  mode text not null default 'single' check (mode in ('single','sequential','parallel','debate','supervisor')),
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  input_text text,
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table agent_tasks enable row level security;
alter table agent_conversations enable row level security;
alter table agent_runs enable row level security;

create policy "authenticated can manage agent_tasks"
  on agent_tasks for all to authenticated using (true) with check (true);

create policy "authenticated can manage agent_conversations"
  on agent_conversations for all to authenticated using (true) with check (true);

create policy "authenticated can manage agent_runs"
  on agent_runs for all to authenticated using (true) with check (true);

-- Indexes
create index if not exists idx_agent_tasks_agent_id on agent_tasks(agent_id);
create index if not exists idx_agent_tasks_conversation_id on agent_tasks(conversation_id);
create index if not exists idx_agent_conversations_agent_id on agent_conversations(agent_id);
create index if not exists idx_agent_runs_workspace_id on agent_runs(workspace_id);
