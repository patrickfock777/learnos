-- Run this in Supabase SQL Editor

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id),
  email text,
  name text,
  workspace_id uuid references workspaces(id),
  role text default 'member',
  created_at timestamptz default now()
);

create table folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references folders(id),
  workspace_id uuid references workspaces(id),
  color text default '#E6F1FB',
  icon text default '📁',
  created_at timestamptz default now()
);

create table texts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  content_improved text,
  content_translated text,
  language text default 'en',
  folder_id uuid references folders(id),
  workspace_id uuid references workspaces(id),
  created_by uuid references auth.users(id),
  questions jsonb default '[]',
  vocabulary jsonb default '[]',
  created_at timestamptz default now()
);

create table vocab_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  color text default '#EEEDFE',
  icon text default '📝',
  workspace_id uuid references workspaces(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table vocab_cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references vocab_sets(id) on delete cascade,
  word_de text not null,
  word_en text not null,
  synonyms jsonb default '[]',
  example_sentence text default '',
  created_at timestamptz default now()
);

create table vocab_progress (
  user_id uuid references auth.users(id),
  card_id uuid references vocab_cards(id) on delete cascade,
  correct int default 0,
  wrong int default 0,
  strength int default 1,
  last_seen timestamptz default now(),
  primary key (user_id, card_id)
);

create table writing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text default '',
  original_text text not null,
  improved_text text,
  feedback jsonb,
  score int,
  created_at timestamptz default now()
);

create table grammar_sentences (
  id uuid primary key default gen_random_uuid(),
  sentence text not null,
  tense text not null,
  signal_words jsonb default '[]',
  explanation text default '',
  difficulty int default 2,
  workspace_id uuid references workspaces(id),
  created_at timestamptz default now()
);

create table grammar_progress (
  user_id uuid references auth.users(id),
  sentence_id uuid references grammar_sentences(id) on delete cascade,
  answered_tense text,
  was_correct boolean,
  answered_at timestamptz default now()
);

-- Enable Row Level Security
alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table folders enable row level security;
alter table texts enable row level security;
alter table vocab_sets enable row level security;
alter table vocab_cards enable row level security;
alter table vocab_progress enable row level security;
alter table writing_sessions enable row level security;
alter table grammar_sentences enable row level security;
alter table grammar_progress enable row level security;

-- Policies: users can see everything in their workspace
create policy "workspace members" on workspaces for all using (id in (select workspace_id from profiles where id = auth.uid()));
create policy "own profile" on profiles for all using (id = auth.uid());
create policy "workspace folders" on folders for all using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "workspace texts" on texts for all using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "workspace vocab sets" on vocab_sets for all using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "workspace vocab cards" on vocab_cards for all using (set_id in (select id from vocab_sets where workspace_id in (select workspace_id from profiles where id = auth.uid())));
create policy "own progress" on vocab_progress for all using (user_id = auth.uid());
create policy "own writing" on writing_sessions for all using (user_id = auth.uid());
create policy "workspace grammar" on grammar_sentences for all using (workspace_id in (select workspace_id from profiles where id = auth.uid()));
create policy "own grammar progress" on grammar_progress for all using (user_id = auth.uid());
