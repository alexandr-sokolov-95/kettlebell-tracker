import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExerciseGroup, ExerciseName } from '../src/editor';
import { formatDate, localDate, validDate } from '../src/locale';
import { russianNames } from '../src/names';
import { completedSets, entry, exercises, initialTracker, performedWorkout, startWorkout, summarize, toggleSet } from '../src/tracker';

test('all exercise translations display before their preserved English names', () => {
  for (const exercise of exercises) {
    assert.match(russianNames[exercise.id], /[А-Яа-яЁё]/);
    const markup = renderToStaticMarkup(createElement(ExerciseName, { id: exercise.id }));
    assert.ok(markup.startsWith(russianNames[exercise.id]));
    assert.ok(markup.includes('lang="en"'));
    assert.ok(markup.includes(exercise.name.replaceAll('&', '&amp;')));
  }
  const style = readFileSync('src/style.css', 'utf8');
  assert.match(style, /\.catalog-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.equal((style.match(/\.catalog-grid\s*\{/g) ?? []).length, 1);
});

test('set toggles are independent and the completed card uses its own style', () => {
  const item = entry('KB-12', 16, 2);
  const card = () => renderToStaticMarkup(createElement(ExerciseGroup, {
    group: 'main', entries: [item], change() {}, kg: 16, bells: 1, previous: {}, baseline: {}, template: false,
  }));
  assert.match(card(), /aria-expanded="false"/);
  assert.match(card(), /hidden="" class="exercise-settings"/);
  item.sets = toggleSet(item.sets, 0);
  assert.equal(completedSets(item).length, 1);
  assert.equal(item.sets[1].completed, undefined);
  assert.doesNotMatch(card(), /all-completed/);
  item.sets = toggleSet(item.sets, 1);
  assert.match(card(), /all-completed/);
  item.sets = toggleSet(item.sets, 0);
  assert.equal(completedSets(item).length, 1);
  assert.equal(item.sets[1].completed, true);
});

test('history counts performed reps, preserves legacy results, and formats local training dates', () => {
  const draft = startWorkout(initialTracker());
  draft.trainingDate = '2026-10-31';
  draft.notes = 'Два подхода';
  draft.main[0].sets = [{ first: 9, second: 9 }, { first: 4, second: 4, completed: true }];
  assert.equal(summarize(draft.main[0], true), '2 подх. · 9, 4 · 16 кг');
  const actual = performedWorkout(draft);
  assert.equal(actual.trainingDate, draft.trainingDate);
  assert.equal(actual.notes, draft.notes);
  assert.equal(actual.warmup.length, 0);
  assert.equal(summarize(actual.main[0], true), '1 × 4 · 16 кг');
  assert.match(formatDate('2026-11-07T00:00:00Z', actual.trainingDate), /31 октября 2026/);
  assert.equal(localDate(new Date(2026, 9, 31, 23, 59)), '2026-10-31');
  assert.equal(validDate('2026-02-30'), false);
});
