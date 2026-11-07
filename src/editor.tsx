import { useId, useState } from 'react';
import { byId, completedSets, entry, exercises, groupNames, move, summarize, toggleSet, type Entry, type Group, type Mode } from './tracker';
import { russianNames } from './names';
import type { EntryResult } from './api';

export function ExerciseName({ id }: { id: string }) {
  return <>{russianNames[id]}<small className="original-name" lang="en">{byId[id].name}</small></>;
}

function NumberField({ label, value, step = 1, set }: {
  label: string; value: number; step?: number; set: (value: number) => void;
}) {
  return <label>{label}<input type="number" min={0} max={999} step={step}
    inputMode={step === 1 ? 'numeric' : 'decimal'} value={Number.isNaN(value) ? '' : value}
    onChange={event => set(event.currentTarget.valueAsNumber)} /></label>;
}

export function ExerciseGroup({ group, entries, change, kg, bells, previous, baseline, template }: {
  group: Group; entries: Entry[]; change: (entries: Entry[]) => void; kg: number; bells: number;
  previous: Record<string, EntryResult>; baseline: Record<string, string>; template: boolean;
}) {
  const [pick, setPick] = useState('');
  const labelId = useId();
  const options = exercises.filter(item => item.bells <= bells && !entries.some(row => row.id === item.id));
  const candidate = options.some(item => item.id === pick) ? pick : '';
  return <section className={`exercise-group group-${group}`} aria-labelledby={labelId}>
    <header className="section-heading"><h2 id={labelId}>{groupNames[group]}</h2><span className="count">{entries.length}</span></header>
    {entries.map((item, index) => <ExerciseCard key={item.id} item={item} template={template}
      previous={previous[item.id]} baseline={baseline[item.id]}
      update={patch => change(entries.map((row, i) => i === index ? { ...row, ...patch } : row))}
      up={index > 0 ? () => change(move(entries, index, index - 1)) : undefined}
      down={index < entries.length - 1 ? () => change(move(entries, index, index + 1)) : undefined}
      remove={() => change(entries.filter((_, i) => i !== index))} />)}
    <div className="add-row">
      <select aria-label={`Добавить упражнение: ${groupNames[group]}`} value={candidate} onChange={event => setPick(event.target.value)}>
        <option value="">Выберите упражнение</option>
        {options.map(item => <option key={item.id} value={item.id}>{item.id} · {russianNames[item.id]}</option>)}
      </select>
      <button type="button" disabled={!candidate} onClick={() => {
        change([...entries, entry(candidate, kg)]); setPick('');
      }}>Добавить</button>
    </div>
  </section>;
}

function ExerciseCard({ item, template, previous, baseline, update, up, down, remove }: {
  item: Entry; template: boolean; previous?: EntryResult; baseline?: string;
  update: (patch: Partial<Entry>) => void; up?: () => void; down?: () => void; remove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const settingsId = useId();
  const exercise = byId[item.id];
  const done = completedSets(item).length;
  const sides = item.mode === 'directions' ? ['По часовой', 'Против часовой'] : ['Левая рука', 'Правая рука'];
  return <article className={`panel exercise-card${!template && done === item.sets.length ? ' all-completed' : ''}`}>
    <div className="exercise-heading">
      <div><span className="eyebrow">{item.id === 'CURL' ? 'CURL · СВОЁ УПРАЖНЕНИЕ' : item.id}</span>
        <h3><ExerciseName id={item.id} /></h3></div>
      <button type="button" className="edit-button" aria-expanded={editing} aria-controls={settingsId}
        aria-label={`${editing ? 'Закрыть редактирование' : 'Редактировать'}: ${russianNames[item.id]}`}
        onClick={() => setEditing(open => !open)}>{editing ? 'Готово' : 'Редактировать'}</button>
    </div>
    <div className="card-meta">
      <span>{summarize(item)}</span>
      {exercise.url && <a href={exercise.url} target="_blank" rel="noreferrer">{exercise.url.includes('/playlist?') ? 'Плейлист' : 'Видео'} ↗</a>}
    </div>
    {!template && <div className="set-tracking">
      <span className="set-progress">{done} из {item.sets.length} подходов</span>
      <div className="set-toggles" role="group" aria-label={`Выполненные подходы: ${russianNames[item.id]}`}>
        {item.sets.map((set, i) => <button type="button" key={i} aria-pressed={set.completed === true}
          aria-label={`Подход ${i + 1}`}
          onClick={() => update({ sets: toggleSet(item.sets, i) })}>
          {set.completed && <span aria-hidden="true">✓ </span>}{i + 1}
        </button>)}
      </div>
    </div>}
    <div id={settingsId} hidden={!editing} className="exercise-settings">
      {(previous || baseline) && <p className="muted">{previous ? `Прошлый результат · ${summarize(previous.entry, true)}` : `Последний известный результат · ${baseline?.replaceAll('each arm', 'на каждую руку')}`}</p>}
      <div className="entry-settings">
        <NumberField label="Вес (кг)" value={item.kg} step={0.25} set={value => update({ kg: value })} />
        <label>Подсчёт повторений<select value={item.mode} onChange={event => update({ mode: event.target.value as Mode })}>
          <option value="total">Всего</option><option value="arms">На каждую руку</option><option value="directions">В каждом направлении</option>
        </select></label>
      </div>
      <div className="sets">{item.sets.map((set, i) => <div className="set-row" key={i}>
        <span className="set-index">№ {i + 1}</span>
        <NumberField label={item.mode === 'total' ? 'Повторения' : sides[0]} value={set.first} set={value => update({
          sets: item.sets.map((old, j) => j === i ? { ...old, first: value } : old),
        })} />
        {item.mode !== 'total' && <NumberField label={sides[1]} value={set.second} set={value => update({
          sets: item.sets.map((old, j) => j === i ? { ...old, second: value } : old),
        })} />}
        <button type="button" aria-label={`Удалить подход ${i + 1}`} disabled={item.sets.length <= 1}
          onClick={() => update({ sets: item.sets.filter((_, j) => i !== j) })}>×</button>
      </div>)}</div>
      <div className="button-row edit-actions">
        <button type="button" className="text-button" disabled={item.sets.length >= 50} onClick={() => update({
          sets: [...item.sets, { ...item.sets.at(-1)!, completed: false }],
        })}>+ Подход</button>
        <button type="button" aria-label="Переместить упражнение выше" disabled={!up} onClick={up}>↑</button>
        <button type="button" aria-label="Переместить упражнение ниже" disabled={!down} onClick={down}>↓</button>
        <button type="button" onClick={remove}>Удалить упражнение</button>
      </div>
    </div>
  </article>;
}
