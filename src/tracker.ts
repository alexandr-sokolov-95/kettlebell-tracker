import catalog from './catalog.json';

export const exercises = [...catalog, {
  id: 'CURL', name: 'Two-Handed Kettlebell Biceps Curl', url: '', requires: [],
  external: [], bells: 1,
}];
export const byId = Object.fromEntries(exercises.map(exercise => [exercise.id, exercise]));
export const skills = catalog;
export const statuses = ['Not learned', 'Learning', 'Learned'] as const;
export type Status = typeof statuses[number];
export type Mode = 'total' | 'arms' | 'directions';
export type Reps = { first: number; second: number };
export type Entry = { id: string; kg: number; mode: Mode; sets: Reps[] };
export type Level = { id: string; goal: number; completed: number; main: Entry[]; practiced: string[] };
export type Draft = { id: string; warmup: Entry[]; main: Entry[]; finisher: Entry[] };
export type Tracker = {
  levels: Level[];
  active: number;
  equipment: { count: number; kg: number };
  warmup: Entry[];
  finisher: Entry[];
  drafts: Record<string, Draft>;
  progress: Record<string, Status>;
  overrides: Record<string, Status>;
  baseline: Record<string, string>;
};
export type Session = {
  id: string;
  level: number;
  completed_at: string;
  workout: Draft;
};
export const groups = ['warmup', 'main', 'finisher'] as const;
export type Group = typeof groups[number];
export const groupNames = { warmup: 'Warmup', main: 'Main work', finisher: 'Finisher' };
const warmupIds = new Set(['KB-01', 'KB-03', 'KB-04', 'KB-05', 'KB-06', 'KB-07']);
const defaultArms = new Set([8,9,10,11,12,13,14,16,17,18,19,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,42,44,47,48,52,54,56,59,61,66,69,70,77,79,81]);

export function entry(id: string, kg: number, count = 3, reps = 5, mode?: Mode): Entry {
  return {
    id, kg, mode: mode ?? (defaultArms.has(Number(id.slice(3))) ? 'arms' : 'total'),
    sets: Array.from({ length: count }, () => ({ first: reps, second: reps })),
  };
}

export function newLevel(main: Entry[]): Level {
  return { id: crypto.randomUUID(), goal: 3, completed: 0, main, practiced: [] };
}

export function initialTracker(): Tracker {
  return {
    levels: [newLevel([entry('KB-02', 16)])], active: 0,
    equipment: { count: 1, kg: 16 },
    warmup: [entry('KB-01', 16, 1, 8), entry('KB-03', 16, 1, 5, 'directions'), entry('KB-04', 16, 1, 5, 'directions')],
    finisher: [entry('CURL', 16, 3, 10)],
    drafts: {}, progress: {}, overrides: {}, baseline: {},
  };
}

export function status(state: Tracker, id: string): Status {
  return state.overrides[id] ?? state.progress[id] ?? 'Not learned';
}

export function suggest(state: Tracker, previous: Level, newlyLearned: string[] = []) {
  const eligible = skills.filter(exercise =>
    !warmupIds.has(exercise.id) && !previous.main.some(item => item.id === exercise.id) &&
    status(state, exercise.id) !== 'Learned' && exercise.bells <= state.equipment.count &&
    exercise.external.length === 0 && exercise.requires.every(id => status(state, id) === 'Learned')
  );
  const unlocked = eligible.filter(exercise => exercise.requires.some(id => newlyLearned.includes(id)));
  return (unlocked.length ? unlocked : eligible).map(exercise => entry(exercise.id, state.equipment.kg));
}

export function advance(state: Tracker, newlyLearned: string[] = []) {
  if (state.active + 1 < state.levels.length) {
    state.active++;
    return true;
  }
  const main = suggest(state, state.levels[state.active], newlyLearned);
  if (!main.length) return false;
  state.levels.push(newLevel(main));
  state.active++;
  return true;
}

export function startWorkout(state: Tracker): Draft {
  return {
    id: crypto.randomUUID(),
    ...structuredClone({
      warmup: state.warmup, main: state.levels[state.active].main, finisher: state.finisher,
    }),
  };
}

export function validWorkout(workout: Draft) {
  return groups.some(group => workout[group].length) && groups.every(group =>
    workout[group].every(item => Number.isFinite(item.kg) && item.kg >= 0 && item.kg <= 999 &&
      item.sets.length > 0 && item.sets.length <= 50 &&
      item.sets.every(set => [set.first, ...(item.mode === 'total' ? [] : [set.second])]
        .every(reps => Number.isInteger(reps) && reps >= 0 && reps <= 999) &&
        (set.first > 0 || (item.mode !== 'total' && set.second > 0))))
  );
}

export function finishWorkout(state: Tracker, workout: Draft) {
  const level = state.levels[state.active];
  level.completed++;
  delete state.drafts[level.id];
  const levelIds = new Set(level.main.map(item => item.id));
  for (const { id } of workout.main) {
    if (id === 'CURL') continue;
    if (levelIds.has(id) && !level.practiced.includes(id)) level.practiced.push(id);
    if (!state.progress[id]) state.progress[id] = 'Learning';
  }
  if (level.completed < level.goal) return;
  const newlyLearned = level.practiced.filter(id => levelIds.has(id) && status(state, id) !== 'Learned' && !state.overrides[id]);
  for (const id of newlyLearned) state.progress[id] = 'Learned';
  advance(state, newlyLearned);
}

export function move<T>(items: T[], from: number, to: number): T[] {
  const result = [...items];
  if (from >= 0 && to >= 0 && from < result.length && to < result.length) {
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
  }
  return result;
}

export function summarize(item: Entry) {
  const sets = item.sets.map(set => item.mode === 'total' ? String(set.first) : `${set.first}/${set.second}`);
  const reps = sets.every(value => value === sets[0])
    ? `${sets.length} × ${sets[0]}`
    : `${sets.length} sets · ${sets.join(', ')}`;
  const sides = item.mode === 'arms' ? ' L/R' : item.mode === 'directions' ? ' CW/CCW' : '';
  return `${reps}${sides} · ${item.kg} kg`;
}
