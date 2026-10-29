-- FlowOps backend schema for Supabase (PostgreSQL).
-- Run in the Supabase SQL editor. Authorization is enforced here with
-- row-level security; the mobile client is untrusted.

create extension if not exists "pgcrypto";

-- Profiles -------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'Technician',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Tasks ----------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) > 0),
  description text not null default '',
  priority text not null check (priority in ('low', 'medium', 'high')),
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'blocked', 'completed')),
  due_at timestamptz,
  assignee_id uuid not null references public.profiles (id),
  requires_evidence boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_assignee_due_idx on public.tasks (assignee_id, due_at);

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  label text not null,
  is_required boolean not null default false,
  is_done boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists checklist_task_idx on public.task_checklist_items (task_id);

create table if not exists public.task_notes (
  id uuid primary key, -- client-generated so offline notes have stable ids
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_task_idx on public.task_notes (task_id);

create table if not exists public.task_attachments (
  id uuid primary key, -- client-generated
  task_id uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null,
  caption text not null default '',
  mime_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_task_idx on public.task_attachments (task_id);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  push_token text not null,
  platform text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, push_token)
);

-- Row-level security ----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_notes enable row level security;
alter table public.task_attachments enable row level security;
alter table public.device_tokens enable row level security;

create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

-- Anyone may read the profile of a note author on a task they can see.
create policy "read note authors" on public.profiles
  for select using (
    exists (
      select 1 from public.task_notes n join public.tasks t on t.id = n.task_id
      where n.author_id = profiles.id and t.assignee_id = auth.uid()
    )
  );

create policy "assignee reads tasks" on public.tasks
  for select using (assignee_id = auth.uid());

-- Assignees may change status fields only; reassignment stays server-side.
create policy "assignee updates tasks" on public.tasks
  for update using (assignee_id = auth.uid()) with check (assignee_id = auth.uid());

create policy "assignee reads checklist" on public.task_checklist_items
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );
create policy "assignee updates checklist" on public.task_checklist_items
  for update using (
    exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );

create policy "assignee reads notes" on public.task_notes
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );
create policy "assignee writes own notes" on public.task_notes
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );

create policy "assignee reads attachments" on public.task_attachments
  for select using (
    exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );
create policy "assignee writes attachments" on public.task_attachments
  for insert with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );
create policy "assignee updates attachments" on public.task_attachments
  for update using (
    exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );

create policy "own device tokens" on public.device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage: private "evidence" bucket, objects stored as <task_id>/<attachment_id>.jpg
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy "assignee uploads evidence" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'evidence'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1] and t.assignee_id = auth.uid()
    )
  );
create policy "assignee updates evidence" on storage.objects
  for update to authenticated using (
    bucket_id = 'evidence'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1] and t.assignee_id = auth.uid()
    )
  );
create policy "assignee reads evidence" on storage.objects
  for select to authenticated using (
    bucket_id = 'evidence'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1] and t.assignee_id = auth.uid()
    )
  );
