-- Quick Capture Notes table
create table notes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  type text default 'note',  -- 'note', 'vocab', 'link'
  status text default 'inbox',  -- 'inbox', 'processed'
  metadata jsonb default '{}',  -- extra data like detected vocab pair, youtube url, etc.
  folder_id uuid references folders(id),
  workspace_id uuid references workspaces(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table notes enable row level security;

create policy "workspace notes" on notes for all
  using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
