create table public.bell_trackers (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  version integer not null default 0 check (version >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object')
);

create table public.bell_sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  level integer not null check (level > 0),
  completed_at timestamptz not null default now(),
  workout jsonb not null check (jsonb_typeof(workout) = 'object'),
  primary key (user_id, id)
);
create index bell_sessions_history on public.bell_sessions (user_id, completed_at desc, id);

create table public.bell_onboarding (
  email text primary key check (email = lower(email)),
  state jsonb not null check (jsonb_typeof(state) = 'object')
);

alter table public.bell_trackers enable row level security;
alter table public.bell_sessions enable row level security;
alter table public.bell_onboarding enable row level security;

revoke all on public.bell_trackers, public.bell_sessions, public.bell_onboarding
  from public, anon, authenticated;
grant select, insert, update on public.bell_trackers to authenticated;
grant select on public.bell_sessions, public.bell_onboarding to authenticated;

create policy tracker_read on public.bell_trackers for select to authenticated
  using (user_id = (select auth.uid()));
create policy tracker_insert on public.bell_trackers for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy tracker_update on public.bell_trackers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sessions_read on public.bell_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy onboarding_read on public.bell_onboarding for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

-- The public wrapper runs as the caller. The narrowly scoped writer lives
-- outside the exposed schema and derives ownership from the session.
create schema if not exists bell_private;
revoke all on schema bell_private from public, anon, authenticated;
grant usage on schema bell_private to authenticated;

create function bell_private.save_workout(
  expected_version integer, next_state jsonb, workout_id uuid,
  level_number integer, payload jsonb
) returns public.bell_sessions
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_version integer;
  saved public.bell_sessions;
begin
  if owner_id is null then raise exception 'Sign in first'; end if;
  select version into current_version from public.bell_trackers
    where user_id = owner_id for update;
  select * into saved from public.bell_sessions
    where user_id = owner_id and id = workout_id;
  if found then return saved; end if;

  if current_version is null or current_version <> expected_version then
    raise exception using errcode = '40001', message = 'Tracker changed elsewhere. Reload to continue.';
  end if;
  if (payload ->> 'id') is distinct from workout_id::text
     or level_number is distinct from ((select state from public.bell_trackers where user_id = owner_id) ->> 'active')::integer + 1 then
    raise exception 'Workout does not match the active level';
  end if;

  insert into public.bell_sessions (user_id, id, level, workout)
    values (owner_id, workout_id, level_number, payload) returning * into saved;
  update public.bell_trackers set state = next_state, version = version + 1
    where user_id = owner_id;
  return saved;
end;
$$;

revoke all on function bell_private.save_workout(integer,jsonb,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function bell_private.save_workout(integer,jsonb,uuid,integer,jsonb) to authenticated;

create function public.bell_save_workout(
  expected_version integer, next_state jsonb, workout_id uuid,
  level_number integer, payload jsonb
) returns public.bell_sessions
language sql security invoker set search_path = '' as $$
  select bell_private.save_workout(expected_version, next_state, workout_id, level_number, payload)
$$;

revoke all on function public.bell_save_workout(integer,jsonb,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.bell_save_workout(integer,jsonb,uuid,integer,jsonb) to authenticated;

create function public.bell_previous_results(exercise_ids text[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(exercise_id, jsonb_build_object(
    'entry', entry, 'completed_at', completed_at
  )), '{}'::jsonb)
  from (
    select distinct on (item.value ->> 'id')
      item.value ->> 'id' as exercise_id, item.value as entry, s.completed_at
    from public.bell_sessions s
    cross join lateral jsonb_array_elements(
      (s.workout -> 'warmup') || (s.workout -> 'main') || (s.workout -> 'finisher')
    ) with ordinality as item(value, position)
    where s.user_id = (select auth.uid())
      and (item.value ->> 'id') = any(exercise_ids)
    order by item.value ->> 'id', s.completed_at desc, s.id, item.position
  ) latest
$$;

revoke all on function public.bell_previous_results(text[]) from public, anon, authenticated;
grant execute on function public.bell_previous_results(text[]) to authenticated;
