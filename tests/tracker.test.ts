import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, byId, entry, finishWorkout, initialTracker, move, newLevel, skills, startWorkout, status, validWorkout } from '../src/tracker';

function starter() {
  const state = initialTracker();
  state.levels = [newLevel(['KB-10', 'KB-12', 'KB-22'].map(id => entry(id, 16)))];
  for (const id of ['01','02','03','04','05','07','08','09','11','14','20','21']) state.progress['KB-' + id] = 'Learned';
  return state;
}

test('complete source catalog has unique IDs and an acyclic dependency graph', () => {
  assert.equal(skills.length, 83);
  assert.equal(new Set(skills.map(item => item.id)).size, skills.length);
  assert.equal(byId['KB-63'].name, 'Double Rockit');
  const done = new Set<string>();
  function visit(id: string, trail: string[]) {
    assert.ok(byId[id], id);
    assert.ok(!trail.includes(id), trail.join(' → '));
    if (done.has(id)) return;
    byId[id].requires.forEach(dep => visit(dep, [...trail, id]));
    done.add(id);
  }
  for (const item of skills) {
    visit(item.id, []);
    assert.match(item.url, /^https:\/\/www\.youtube\.com\/(watch|playlist)\?/);
  }
  assert.deepEqual(new Set(byId['KB-23'].requires), new Set(['KB-08','KB-22']));
});

test('extended level advances to new unlocked exercises and preserves warmup', () => {
  const state = starter();
  const original = structuredClone(state.warmup);
  state.levels[0].goal++;
  for (let n = 0; n < 3; n++) finishWorkout(state, startWorkout(state));
  assert.equal(state.active, 0);
  finishWorkout(state, startWorkout(state));
  assert.equal(state.active, 1);
  assert.equal(state.levels[0].completed, 4);
  const ids = state.levels[1].main.map(item => item.id);
  for (const id of ['KB-13','KB-17','KB-23']) assert.ok(ids.includes(id));
  for (const id of ids) {
    assert.notEqual(status(state, id), 'Learned');
    assert.ok(byId[id].requires.every(dep => status(state, dep) === 'Learned'));
    assert.equal(byId[id].bells, 1);
  }
  assert.deepEqual(state.warmup, original);
  state.active--;
  assert.ok(advance(state));
  assert.equal(state.levels.length, 2);
});

test('manual changes are scoped and overrides control progression', () => {
  const state = starter();
  state.overrides['KB-12'] = 'Learning';
  const draft = startWorkout(state);
  draft.main = move(draft.main, 2, 0).filter(item => item.id !== 'KB-10');
  draft.main.push(entry('KB-56', 16));
  draft.main[0].sets[1].first = 7;
  assert.ok(validWorkout(draft));
  assert.equal(state.levels[0].main[2].sets[1].first, 5);
  for (let n = 0; n < 3; n++) finishWorkout(state, draft);
  assert.equal(status(state, 'KB-10'), 'Not learned');
  assert.equal(status(state, 'KB-12'), 'Learning');
  assert.equal(status(state, 'KB-56'), 'Learning');
  assert.ok(!state.levels[1].main.some(item => ['KB-13','KB-17'].includes(item.id)));
  draft.main[0].sets[1].first = -1;
  assert.equal(validWorkout(draft), false);
});

test('manual advancement does not teach the skipped skills', () => {
  const state = starter();
  assert.ok(advance(state));
  assert.equal(state.active, 1);
  assert.equal(status(state, 'KB-22'), 'Not learned');
  assert.ok(!state.levels[1].main.some(item => item.id === 'KB-23'));
});
