import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { initialTracker, startWorkout } from '../src/tracker';

test('Postgres draft persistence, atomic retry, and cross-user RLS', async () => {
  const db = await PGlite.create();
  const owner = '00000000-0000-4000-a000-000000000001';
  const other = '00000000-0000-4000-a000-000000000002';
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      grant usage on schema auth to authenticated, anon;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${owner}'), ('${other}');
      create function auth.uid() returns uuid language sql stable
        as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable
        as $$select current_setting('request.jwt.claims', true)::jsonb$$;
    `);
    for (const name of readdirSync('supabase/migrations').sort()) {
      await db.exec(readFileSync('supabase/migrations/' + name, 'utf8'));
    }
    const state = initialTracker();
    const workout = startWorkout(state);
    await db.query('insert into public.bell_onboarding values ($1, $2)', ['owner@example.test', state]);
    await db.exec(`set role authenticated;
      set request.jwt.claim.sub = '${owner}';
      set request.jwt.claims = '{"email":"owner@example.test"}';`);
    assert.equal((await db.query('select * from public.bell_onboarding')).rows.length, 1);
    await db.query('insert into public.bell_trackers(state) values ($1)', [state]);
    state.drafts[state.levels[0].id] = workout;
    await db.query('update public.bell_trackers set state=$1, version=1 where version=0', [state]);
    const restored = await db.query<{ draft: typeof workout }>('select state->\'drafts\'->$1::text as draft from public.bell_trackers', [state.levels[0].id]);
    assert.deepEqual(restored.rows[0].draft, workout);
    delete state.drafts[state.levels[0].id];
    state.levels[0].completed++;
    const save = 'select public.bell_save_workout($1,$2,$3,$4,$5)';
    await assert.rejects(db.query(save, [0, state, workout.id, 1, workout]), /Tracker changed elsewhere/);
    assert.equal((await db.query('select * from public.bell_sessions')).rows.length, 0);
    await db.query(save, [1, state, workout.id, 1, workout]);
    await db.query(save, [1, state, workout.id, 1, workout]);
    assert.equal((await db.query('select * from public.bell_sessions')).rows.length, 1);
    const version = await db.query<{ version: number }>('select version from public.bell_trackers');
    assert.equal(version.rows[0].version, 2);
    const last = await db.query<{ results: Record<string, unknown> }>("select public.bell_previous_results(array['KB-02']) as results");
    assert.ok(last.rows[0].results['KB-02']);
    await assert.rejects(db.query('delete from public.bell_sessions'), /permission denied/);
    await db.exec(`set request.jwt.claim.sub = '${other}';
      set request.jwt.claims = '{"email":"other@example.test"}';`);
    for (const table of ['bell_trackers', 'bell_sessions', 'bell_onboarding']) {
      assert.equal((await db.query('select * from public.' + table)).rows.length, 0);
    }
    await assert.rejects(db.query('insert into public.bell_trackers(user_id,state) values ($1,$2)', [owner, state]), /row-level security/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.bell_sessions'), /permission denied/);
  } finally { await db.close(); }
});
