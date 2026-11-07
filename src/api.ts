import { createClient } from '@supabase/supabase-js';
import { initialTracker, type Draft, type Session, type Tracker } from './tracker';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client = url && key?.startsWith('sb_publishable_') ? createClient(url, key) : null;

export type Snapshot = { state: Tracker; version: number };

export async function loadTracker(): Promise<Snapshot> {
  const db = client!;
  const existing = await db.from('bell_trackers').select('state,version').maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const seed = await db.from('bell_onboarding').select('state').maybeSingle();
  if (seed.error) throw seed.error;
  const created = await db.from('bell_trackers').insert({ state: seed.data?.state ?? initialTracker() })
    .select('state,version').single();
  if (created.error?.code === '23505') return loadTracker();
  if (created.error) throw created.error;
  return created.data;
}

export async function writeTracker(expected: number, state: Tracker): Promise<Snapshot> {
  const result = await client!.from('bell_trackers').update({ state, version: expected + 1 })
    .eq('version', expected).select('state,version').maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error('Tracker changed elsewhere. Reload to continue.');
  return result.data;
}

export async function saveWorkout(expected: number, state: Tracker, level: number, workout: Draft) {
  const { error } = await client!.rpc('bell_save_workout', {
    expected_version: expected, next_state: state, workout_id: workout.id,
    level_number: level, payload: workout,
  });
  if (error) throw error;
}

export async function loadHistory(offset: number): Promise<Session[]> {
  const { data, error } = await client!.from('bell_sessions')
    .select('id,level,completed_at,workout')
    .order('completed_at', { ascending: false }).order('id')
    .range(offset, offset + 24);
  if (error) throw error;
  return data;
}

export async function loadPrevious(ids: string[]): Promise<Record<string, EntryResult>> {
  const { data, error } = await client!.rpc('bell_previous_results', { exercise_ids: ids });
  if (error) throw error;
  return data ?? {};
}

export type EntryResult = { entry: import('./tracker').Entry; completed_at: string };
