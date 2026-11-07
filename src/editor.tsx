import { useId, useState } from 'react';
import { byId, entry, exercises, groupNames, move, summarize, type Entry, type Group, type Mode } from './tracker';
import type { EntryResult } from './api';

function NumberField({ label, value, min = 0, max = 999, step = 1, set }: {
  label: string; value: number; min?: number; max?: number; step?: number; set: (value: number) => void;
}) {
  return <label>{label}<input type="number" min={min} max={max} step={step}
    inputMode={step === 1 ? 'numeric' : 'decimal'} value={Number.isNaN(value) ? '' : value}
    onChange={event => set(event.currentTarget.valueAsNumber)} /></label>;
}

export function ExerciseGroup({ group, entries, change, kg, bells, previous, baseline }: {
  group: Group; entries: Entry[]; change: (entries: Entry[]) => void; kg: number; bells: number;
  previous: Record<string, EntryResult>; baseline: Record<string, string>;
}) {
  const [pick, setPick] = useState('');
  const labelId = useId();
  const options = exercises.filter(item => item.bells <= bells && !entries.some(row => row.id === item.id));
  const candidate = options.some(item => item.id === pick) ? pick : '';
  return <section className="exercise-group" aria-labelledby={labelId}>
    <header className="section-heading"><h2 id={labelId}>{groupNames[group]}</h2><span className="count">{entries.length}</span></header>
    {entries.map((item, index) => {
      const exercise = byId[item.id];
      const update = (patch: Partial<Entry>) => change(entries.map((row, i) => i === index ? { ...row, ...patch } : row));
      const previousEntry = previous[item.id];
      const sides = item.mode === 'directions' ? ['Clockwise', 'Counterclockwise'] : ['Left reps', 'Right reps'];
      return <article className="panel exercise-card" key={item.id}>
        <div className="exercise-heading">
          <div><span className="eyebrow">{item.id === 'CURL' ? 'CUSTOM' : item.id}</span><h3>{exercise.name}</h3></div>
          <div className="icon-row">
            <button type="button" title="Move up" aria-label={`Move ${exercise.name} up`} disabled={index === 0} onClick={() => change(move(entries, index, index - 1))}>↑</button>
            <button type="button" title="Move down" aria-label={`Move ${exercise.name} down`} disabled={index === entries.length - 1} onClick={() => change(move(entries, index, index + 1))}>↓</button>
            <button type="button" title="Remove" aria-label={`Remove ${exercise.name}`} onClick={() => change(entries.filter((_, i) => i !== index))}>×</button>
          </div>
        </div>
        <div className="muted previous">{previousEntry ? `Previous · ${summarize(previousEntry.entry)}`
          : baseline[item.id] ? `Last known · ${baseline[item.id]}` : 'First recorded result'}
          {exercise.url && <> · <a href={exercise.url} target="_blank" rel="noreferrer">{exercise.url.includes('/playlist?') ? 'Playlist' : 'Video'} ↗</a></>}
        </div>
        <div className="entry-settings">
          <NumberField label="Weight (kg)" value={item.kg} step={0.25} set={value => update({ kg: value })} />
          <label>Rep counting<select value={item.mode} onChange={event => update({ mode: event.target.value as Mode })}>
            <option value="total">Total reps</option><option value="arms">Per arm</option><option value="directions">Per direction</option>
          </select></label>
        </div>
        <div className="sets">
          {item.sets.map((set, i) => <div className="set-row" key={i}>
            <span className="set-index">Set {i + 1}</span>
            <NumberField label={item.mode === 'total' ? 'Reps' : sides[0]} value={set.first} set={value => update({
              sets: item.sets.map((old, j) => j === i ? { ...old, first: value } : old),
            })} />
            {item.mode !== 'total' && <NumberField label={sides[1]} value={set.second} set={value => update({
              sets: item.sets.map((old, j) => j === i ? { ...old, second: value } : old),
            })} />}
            <button type="button" className="remove-set" aria-label={`Remove set ${i + 1}`}
              disabled={item.sets.length <= 1} onClick={() => update({ sets: item.sets.filter((_, j) => i !== j) })}>×</button>
          </div>)}
        </div>
        <button type="button" className="text-button" disabled={item.sets.length >= 50}
          onClick={() => update({ sets: [...item.sets, { ...item.sets.at(-1)! }] })}>+ Add set</button>
      </article>;
    })}
    <div className="add-row">
      <select aria-label={`Add exercise to ${groupNames[group]}`} value={candidate} onChange={event => setPick(event.target.value)}>
        <option value="">Choose an exercise</option>
        {options.map(item => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
      </select>
      <button type="button" disabled={!candidate} onClick={() => {
        change([...entries, entry(candidate, kg)]); setPick('');
      }}>Add</button>
    </div>
  </section>;
}
