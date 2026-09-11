-- =====================================================================
-- DevNotes — Schema cho Supabase
-- Chạy toàn bộ file này trong: Supabase Dashboard > SQL Editor > New query
-- =====================================================================

-- ---------- 1. BẢNG DỰ ÁN ----------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ---------- 2. BẢNG NOTE (tên note = 1 tab) ----------
create table if not exists public.note_tabs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  position    int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- 3. BẢNG NỘI DUNG trong mỗi note ----------
create table if not exists public.note_items (
  id          uuid primary key default gen_random_uuid(),
  tab_id      uuid not null references public.note_tabs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  content     text,
  tag         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 4. INDEX ----------
create index if not exists idx_projects_user   on public.projects(user_id);
create index if not exists idx_tabs_project    on public.note_tabs(project_id);
create index if not exists idx_tabs_user       on public.note_tabs(user_id);
create index if not exists idx_items_tab       on public.note_items(tab_id);
create index if not exists idx_items_user      on public.note_items(user_id);

-- ---------- 5. BẬT ROW LEVEL SECURITY ----------
alter table public.projects   enable row level security;
alter table public.note_tabs  enable row level security;
alter table public.note_items enable row level security;

-- ---------- 6. POLICY: mỗi user chỉ thấy & sửa dữ liệu của chính mình ----------
drop policy if exists "projects_select" on public.projects;
drop policy if exists "projects_insert" on public.projects;
drop policy if exists "projects_update" on public.projects;
drop policy if exists "projects_delete" on public.projects;

create policy "projects_select" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete" on public.projects
  for delete using (auth.uid() = user_id);

drop policy if exists "tabs_select" on public.note_tabs;
drop policy if exists "tabs_insert" on public.note_tabs;
drop policy if exists "tabs_update" on public.note_tabs;
drop policy if exists "tabs_delete" on public.note_tabs;

create policy "tabs_select" on public.note_tabs
  for select using (auth.uid() = user_id);
create policy "tabs_insert" on public.note_tabs
  for insert with check (auth.uid() = user_id);
create policy "tabs_update" on public.note_tabs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tabs_delete" on public.note_tabs
  for delete using (auth.uid() = user_id);

drop policy if exists "items_select" on public.note_items;
drop policy if exists "items_insert" on public.note_items;
drop policy if exists "items_update" on public.note_items;
drop policy if exists "items_delete" on public.note_items;

create policy "items_select" on public.note_items
  for select using (auth.uid() = user_id);
create policy "items_insert" on public.note_items
  for insert with check (auth.uid() = user_id);
create policy "items_update" on public.note_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "items_delete" on public.note_items
  for delete using (auth.uid() = user_id);

-- ---------- 7. Tự động cập nhật updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_items_updated on public.note_items;
create trigger trg_items_updated
  before update on public.note_items
  for each row execute function public.set_updated_at();
