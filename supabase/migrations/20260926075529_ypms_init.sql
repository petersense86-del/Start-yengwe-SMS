-- YPMS initial schema: profiles linked to Supabase Auth, school data tables,
-- and row-level security so every access rule is enforced by the database.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Passwords live only in auth.users (hashed).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  role text not null check (role in ('headteacher', 'deputy', 'hod', 'teacher', 'pupil')),
  full_name text not null,
  grade text,
  class_section text,
  hod_department text,
  must_change_password boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_one_headteacher on public.profiles (role) where role = 'headteacher';
create unique index profiles_one_deputy on public.profiles (role) where role = 'deputy';
create index profiles_role_idx on public.profiles (role);

-- Role helpers. SECURITY DEFINER so policies can read the caller's role
-- without recursing through profiles RLS. Kept out of the exposed API schema.
create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('headteacher', 'deputy') from public.profiles where id = auth.uid()), false)
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role <> 'pupil' from public.profiles where id = auth.uid()), false)
$$;

create or replace function private.is_it_hod() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'hod' and hod_department = 'IT Department' from public.profiles where id = auth.uid()), false)
$$;

create or replace function private.my_class() returns table (grade text, class_section text)
language sql stable security definer set search_path = '' as $$
  select grade, coalesce(class_section, 'A') from public.profiles where id = auth.uid()
$$;

-- Pick selected keys out of a jsonb object.
create or replace function private.jsonb_pick(obj jsonb, keys text[]) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(coalesce(obj, '{}'::jsonb)) where key = any(keys)
$$;

-- Guard: non-admins can never change roles, usernames, class placement or
-- admin-managed fields, even by calling the API directly.
create or replace function private.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  protected_keys text[] := array['pupilId', 'teacherId', 'subjects', 'classes', 'departments',
    'employmentStatus', 'statusNote', 'statusDate', 'previousSchool', 'enrollmentYear', 'profilePicture'];
  me text := private.my_role();
begin
  new.updated_at := now();
  new.id := old.id;
  new.username := old.username;
  new.created_at := old.created_at;

  -- Service role (edge functions) and the headteacher may change anything.
  if auth.uid() is null or me = 'headteacher' then
    return new;
  end if;

  if me = 'deputy' then
    -- The deputy cannot alter the headteacher or promote anyone to head/deputy.
    if old.role = 'headteacher' then
      raise exception 'The deputy cannot modify the headteacher account';
    end if;
    if new.role in ('headteacher', 'deputy') and new.role <> old.role then
      raise exception 'Only the headteacher can assign admin roles';
    end if;
    return new;
  end if;

  new.role := old.role;

  if new.id = auth.uid() then
    new.grade := old.grade;
    new.class_section := old.class_section;
    new.hod_department := old.hod_department;
    -- A user may clear their own "must change password" flag, never set it.
    new.must_change_password := old.must_change_password and new.must_change_password;
    if private.is_it_hod() then
      protected_keys := array_remove(protected_keys, 'profilePicture');
    end if;
    new.data := (coalesce(new.data, '{}'::jsonb) - protected_keys) || private.jsonb_pick(old.data, protected_keys);
    return new;
  end if;

  if me = 'hod' and old.role in ('teacher', 'hod') then
    -- HoDs may only (re)assign subjects and classes.
    new.full_name := old.full_name;
    new.grade := old.grade;
    new.class_section := old.class_section;
    new.hod_department := old.hod_department;
    new.must_change_password := old.must_change_password;
    new.data := old.data || private.jsonb_pick(new.data, array['subjects', 'classes']);
    return new;
  end if;

  raise exception 'Not allowed to modify this profile';
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

alter table public.profiles enable row level security;

create policy "profiles: staff read all, pupils read staff and self"
  on public.profiles for select to authenticated
  using (private.is_staff() or id = auth.uid() or role <> 'pupil');

create policy "profiles: update own, admins any, HoDs staff"
  on public.profiles for update to authenticated
  using (id = auth.uid() or private.is_admin() or (private.my_role() = 'hod' and role in ('teacher', 'hod')))
  with check (id = auth.uid() or private.is_admin() or (private.my_role() = 'hod' and role in ('teacher', 'hod')));
-- Inserts and deletes happen only through the admin-users edge function (service role).

-- ---------------------------------------------------------------------------
-- Results. Each subject score is its own row so publishing is per subject and
-- pupils can only ever receive published marks.
-- ---------------------------------------------------------------------------
create table public.results (
  id text primary key,
  pupil_id uuid not null references public.profiles (id) on delete cascade,
  term text not null,
  year int not null,
  grade text not null,
  published boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (pupil_id, term, year, grade)
);
create index results_pupil_idx on public.results (pupil_id);

create table public.result_scores (
  id text primary key,
  result_id text not null references public.results (id) on delete cascade,
  pupil_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  teacher_id uuid references public.profiles (id) on delete set null,
  published boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  unique (result_id, subject)
);
create index result_scores_result_idx on public.result_scores (result_id);
create index result_scores_pupil_idx on public.result_scores (pupil_id);
create index result_scores_teacher_idx on public.result_scores (teacher_id);

alter table public.results enable row level security;
alter table public.result_scores enable row level security;

create policy "results: staff read all, pupils own published"
  on public.results for select to authenticated
  using (private.is_staff() or (pupil_id = auth.uid() and published));
create policy "results: staff insert" on public.results for insert to authenticated
  with check (private.is_staff());
create policy "results: staff update" on public.results for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
create policy "results: admins delete, or empty results" on public.results for delete to authenticated
  using (private.is_admin() or (private.is_staff() and not exists (select 1 from public.result_scores s where s.result_id = results.id)));

create policy "scores: staff read all, pupils own published"
  on public.result_scores for select to authenticated
  using (private.is_staff() or (pupil_id = auth.uid() and published));
create policy "scores: admins any, teachers own" on public.result_scores for insert to authenticated
  with check (private.is_admin() or (private.is_staff() and teacher_id = auth.uid()));
create policy "scores: admins any, teachers own unpublished" on public.result_scores for update to authenticated
  using (private.is_admin() or (private.is_staff() and teacher_id = auth.uid() and not published))
  with check (private.is_admin() or (private.is_staff() and teacher_id = auth.uid()));
create policy "scores: admins delete any, teachers own unpublished" on public.result_scores for delete to authenticated
  using (private.is_admin() or (private.is_staff() and teacher_id = auth.uid() and not published));

-- ---------------------------------------------------------------------------
-- Homework
-- ---------------------------------------------------------------------------
create table public.homework (
  id text primary key,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  grade text not null,
  section text not null default 'A',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index homework_teacher_idx on public.homework (teacher_id);
alter table public.homework enable row level security;
create policy "homework: staff read all, pupils their class" on public.homework for select to authenticated
  using (private.is_staff() or exists (select 1 from private.my_class() c where c.grade = homework.grade and c.class_section = homework.section));
create policy "homework: staff post as self" on public.homework for insert to authenticated
  with check (private.is_staff() and teacher_id = auth.uid());
create policy "homework: owner or headteacher delete" on public.homework for delete to authenticated
  using (teacher_id = auth.uid() or private.my_role() = 'headteacher');

-- ---------------------------------------------------------------------------
-- Notices and system updates
-- ---------------------------------------------------------------------------
create table public.notices (
  id text primary key,
  posted_by uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notices_posted_by_idx on public.notices (posted_by);
alter table public.notices enable row level security;
create policy "notices: everyone reads" on public.notices for select to authenticated using (true);
create policy "notices: admins post" on public.notices for insert to authenticated
  with check (private.is_admin() and posted_by = auth.uid());
create policy "notices: headteacher edits" on public.notices for update to authenticated
  using (private.my_role() = 'headteacher') with check (private.my_role() = 'headteacher');
create policy "notices: headteacher deletes" on public.notices for delete to authenticated
  using (private.my_role() = 'headteacher');

create table public.system_updates (
  id text primary key,
  posted_by uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index system_updates_posted_by_idx on public.system_updates (posted_by);
alter table public.system_updates enable row level security;
create policy "updates: everyone reads" on public.system_updates for select to authenticated using (true);
create policy "updates: admins and IT post" on public.system_updates for insert to authenticated
  with check ((private.is_admin() or private.is_it_hod()) and posted_by = auth.uid());
create policy "updates: headteacher deletes" on public.system_updates for delete to authenticated
  using (private.my_role() = 'headteacher');

-- ---------------------------------------------------------------------------
-- Messages (only sender and recipient can see a message)
-- ---------------------------------------------------------------------------
create table public.messages (
  id text primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_from_idx on public.messages (from_id);
create index messages_to_idx on public.messages (to_id);
alter table public.messages enable row level security;
create policy "messages: participants read" on public.messages for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
create policy "messages: send as self to visible users" on public.messages for insert to authenticated
  with check (from_id = auth.uid() and read = false and exists (select 1 from public.profiles p where p.id = to_id));
create policy "messages: recipient marks read" on public.messages for update to authenticated
  using (to_id = auth.uid()) with check (to_id = auth.uid());
revoke update on public.messages from authenticated;
grant update (read) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Audit logs (append-only; only the headteacher can read them)
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id text primary key,
  user_id uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_user_idx on public.activity_logs (user_id);
alter table public.activity_logs enable row level security;
create policy "activity: log as self" on public.activity_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy "activity: headteacher reads" on public.activity_logs for select to authenticated
  using (private.my_role() = 'headteacher');

create table public.download_logs (
  id text primary key,
  downloaded_by uuid references public.profiles (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index download_logs_by_idx on public.download_logs (downloaded_by);
alter table public.download_logs enable row level security;
create policy "downloads: log as self" on public.download_logs for insert to authenticated
  with check (downloaded_by = auth.uid());
create policy "downloads: headteacher reads" on public.download_logs for select to authenticated
  using (private.my_role() = 'headteacher');

-- Stamp the real name and role on log rows so they cannot be forged.
create or replace function private.stamp_log_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  new.created_at := now();
  if auth.uid() is null then
    return new; -- trusted server-side insert
  end if;
  select full_name, role into p from public.profiles where id = auth.uid();
  if tg_table_name = 'activity_logs' then
    new.data := new.data || jsonb_build_object('userName', p.full_name, 'role', p.role, 'timestamp', now());
  else
    new.data := new.data || jsonb_build_object('downloadedByName', p.full_name, 'role', p.role, 'downloadedAt', now());
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger activity_logs_identity before insert on public.activity_logs
  for each row execute function private.stamp_log_identity();
create trigger download_logs_identity before insert on public.download_logs
  for each row execute function private.stamp_log_identity();

-- ---------------------------------------------------------------------------
-- School settings and biography (one row each)
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key check (key in ('settings', 'biography')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
create policy "config: signed-in users read" on public.app_config for select to authenticated using (true);
create policy "config: admins edit settings, admins and IT edit biography" on public.app_config for update to authenticated
  using ((key = 'settings' and private.is_admin()) or (key = 'biography' and (private.is_admin() or private.is_it_hod())))
  with check ((key = 'settings' and private.is_admin()) or (key = 'biography' and (private.is_admin() or private.is_it_hod())));

-- The deputy cannot change headteacher-only branding (logo, signature, stamp).
create or replace function private.settings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare head_keys text[] := array['schoolLogo', 'headteacherSignature', 'systemDomain', 'headteacherName',
  'stampShape', 'stampColor', 'stampDate', 'stampShowDate', 'stampText', 'stampEnabled', 'stampSize', 'stampXOffset', 'stampYOffset'];
begin
  new.updated_at := now();
  if new.key = 'settings' and auth.uid() is not null and private.my_role() <> 'headteacher' then
    new.data := (new.data - head_keys) || private.jsonb_pick(old.data, head_keys);
  end if;
  return new;
end;
$$;
create trigger app_config_guard before update on public.app_config
  for each row execute function private.settings_guard();

-- Granted after every private function exists so none are missed.
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

insert into public.app_config (key, data) values
  ('settings', jsonb_build_object(
    'headteacherName', 'Headteacher', 'deputyName', 'Deputy Headteacher',
    'schoolEmail', 'info@smart.yengwe.sch', 'schoolMotto', 'RISE & SHINE', 'systemDomain', 'smart yengwe.sch',
    'watermarkOpacity', 0.04, 'watermarkEnabled', true,
    'stampShape', 'round', 'stampColor', '#B41414', 'stampShowDate', true, 'stampText', 'YENGWE SECONDARY SCHOOL',
    'stampEnabled', true, 'stampSize', 18, 'stampXOffset', 38, 'stampYOffset', 2)),
  ('biography', jsonb_build_object('id', 'bio-default', 'aboutText', '', 'mission', '', 'vision', '', 'history', '',
    'gallery', '[]'::jsonb, 'animationStyle', 'fade', 'updatedBy', 'system', 'updatedByName', ''));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Branding and first-run state for the login screen (callable before sign-in).
create or replace function public.get_login_branding() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schoolLogo', (select data->'schoolLogo' from public.app_config where key = 'settings'),
    'schoolMotto', (select data->'schoolMotto' from public.app_config where key = 'settings'),
    'hasHeadteacher', exists (select 1 from public.profiles where role = 'headteacher')
  )
$$;
revoke execute on function public.get_login_branding() from public;
grant execute on function public.get_login_branding() to anon, authenticated;

-- School-wide aggregate numbers for the dashboard. Pupils get totals only,
-- never anyone else's marks.
create or replace function public.get_school_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'pupils', (select count(*) from public.profiles where role = 'pupil'),
    'teachers', (select count(*) from public.profiles where role in ('teacher', 'hod')),
    'hods', (select count(*) from public.profiles where role = 'hod'),
    'publishedResults', (select count(*) from public.results where published),
    'schoolAvg', (select coalesce(avg((data->>'score')::numeric), 0) from public.result_scores where published)
  ) end
$$;
revoke execute on function public.get_school_stats() from public;
grant execute on function public.get_school_stats() to authenticated;

-- Live chat updates
alter publication supabase_realtime add table public.messages;
