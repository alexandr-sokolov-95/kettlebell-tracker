import { useEffect, useRef, useState } from 'react';
import { client, loadHistory, loadPrevious, loadTracker, saveWorkout, writeTracker, type EntryResult, type Snapshot } from './api';
import { ExerciseGroup } from './editor';
import { Bell, message } from './ui';
import {
  advance, byId, finishWorkout, groupNames, groups, newLevel, skills, startWorkout, status,
  statuses, summarize, validWorkout, type Draft, type Session, type Status, type Tracker,
} from './tracker';

const tabs = ['Workout', 'Exercises', 'History'] as const;
type Tab = typeof tabs[number];

export function Workspace() {
  const [tab, setTab] = useState<Tab>('Workout');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const current = useRef<Snapshot>(undefined);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);

  function accept(next: Snapshot) {
    current.current = next;
    setSnapshot(next);
  }
  async function reload() {
    setError('');
    try { accept(await loadTracker()); }
    catch (err) { setError(message(err)); }
  }
  useEffect(() => { void reload(); }, []);

  async function transact(action: (state: Tracker) => Promise<void>) {
    if (pending.current || !current.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action(structuredClone(current.current.state));
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const update = (apply: (state: Tracker) => void) => transact(async state => {
    apply(state);
    accept(await writeTracker(current.current!.version, state));
  });
  const complete = (workout: Draft) => transact(async state => {
    const previous = state.active;
    finishWorkout(state, workout);
    await saveWorkout(current.current!.version, state, previous + 1, workout);
    accept(await loadTracker());
    setHistoryVersion(version => version + 1);
    setEditorVersion(version => version + 1);
    setNotice(state.active !== previous ? `Workout saved. Level ${state.active + 1} is ready.` : 'Workout saved to history.');
  });

  return <>
    <header className="masthead"><div className="shell topbar">
      <div className="wordmark"><span className="logo"><Bell /></span>Bell Log<span className="accent">.</span></div>
      <button className="signout" disabled={busy} onClick={async () => {
        const { error: failure } = await client!.auth.signOut();
        if (failure) setError(failure.message);
      }}>Sign out</button>
    </div></header>
    <div className="shell layout">
      <nav aria-label="Tracker navigation">
        {tabs.map(item => <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => { setTab(item); setNotice(''); }}>
          {item}
        </button>)}
      </nav>
      <main>
        {error && <div className="panel error banner" role="alert">{error}
          {error.includes('Reload') && <button onClick={async () => { await reload(); setEditorVersion(version => version + 1); }}>Reload tracker</button>}
        </div>}
        {notice && <p className="panel banner" role="status">{notice}</p>}
        {!snapshot ? <div className="panel loading">{error ? <button onClick={reload}>Retry connection</button> : 'Loading your tracker…'}</div> : <>
          <div hidden={tab !== 'Workout'}>
            <Workout key={`${snapshot.state.levels[snapshot.state.active].id}:${editorVersion}`} state={snapshot.state} busy={busy}
              update={update} complete={complete} historyVersion={historyVersion} setNotice={setNotice} />
          </div>
          {tab === 'Exercises' && <Catalog state={snapshot.state} busy={busy} update={update} />}
          {tab === 'History' && <History key={historyVersion} baseline={snapshot.state.baseline} />}
        </>}
      </main>
      <footer>Catalog adapted from <a href="https://github.com/dznz/wildman-skill-trees/tree/67f44fa37ec9fabdcf67632b784fcc81698db77a/src/kb" target="_blank" rel="noreferrer">dznz’s Wildman Skill Trees</a> based on Mark Wildman’s teachings. © 2023 · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a></footer>
    </div>
  </>;
}

type Update = (apply: (state: Tracker) => void) => Promise<boolean>;

function Workout({ state, busy, update, complete, historyVersion, setNotice }: {
  state: Tracker; busy: boolean; update: Update; complete: (draft: Draft) => Promise<boolean>;
  historyVersion: number; setNotice: (text: string) => void;
}) {
  const level = state.levels[state.active];
  const [draft, setDraft] = useState(() => state.drafts[level.id] ?? startWorkout(state));
  const [template, setTemplate] = useState<Draft>();
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);
  const [previous, setPrevious] = useState<Record<string, EntryResult>>({});
  const [previousError, setPreviousError] = useState('');
  const draftRef = useRef(draft);
  const ids = [...new Set(groups.flatMap(group => (template ?? draft)[group].map(item => item.id)))].sort().join(',');

  useEffect(() => {
    let live = true;
    if (!ids) return;
    loadPrevious(ids.split(',')).then(results => {
      if (live) { setPrevious(results); setPreviousError(''); }
    }).catch(err => { if (live) setPreviousError(message(err)); });
    return () => { live = false; };
  }, [ids, historyVersion]);

  async function persistDraft() {
    const editing = draftRef.current;
    const saved = await update(next => { next.drafts[level.id] = editing; });
    if (draftRef.current === editing) { setFailed(!saved); setDirty(!saved); }
  }

  useEffect(() => {
    if (!dirty || failed || busy || !validWorkout(draft)) return;
    const timer = window.setTimeout(() => { void persistDraft(); }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, failed, busy]);

  async function changeLevel(direction: -1 | 1, blank = false) {
    await update(next => {
      if (dirty) {
        if (!validWorkout(draft)) throw new Error('Fix the workout entries before switching levels.');
        next.drafts[level.id] = draft;
      }
      if (direction === -1) next.active--;
      else if (blank) {
        next.levels.push(newLevel([]));
        next.active++;
      } else if (!advance(next)) {
        throw new Error('No new skills meet the prerequisites and equipment. Create a custom level or update your skill statuses.');
      }
    });
  }

  const editing = template ?? draft;
  return <>
    <section className="hero">
      <div className="hero-heading"><div><span className="eyebrow">TRAINING PLAN</span>
        <h1>Level {state.active + 1}<span>.</span></h1><p>{level.main.length} main exercises · {state.equipment.count} × {state.equipment.kg} kg kettlebell</p>
      </div><div className="hero-icon"><Bell /></div></div>
      <div className="meter-label"><span>Level progress</span><strong>{level.completed} / {level.goal} workouts</strong></div>
      <progress value={Math.min(level.completed, level.goal)} max={level.goal} aria-label="Level progress" />
      <div className="button-row level-actions">
        <button disabled={busy || !!template || state.active === 0} onClick={() => changeLevel(-1)}>← Previous level</button>
        <button disabled={busy || !!template} onClick={() => update(next => { next.levels[next.active].goal = Math.max(level.goal, level.completed) + 1; })}>Extend +1</button>
        <button disabled={busy || !!template} onClick={() => changeLevel(1)}>Next level →</button>
      </div>
      {state.active + 1 === state.levels.length && <button className="text-button" disabled={busy || !!template}
        onClick={() => changeLevel(1, true)}>Create custom next level</button>}
    </section>

    <div className="workout-toolbar">
      <div><span className="eyebrow">{template ? 'PLAN EDITOR' : 'SESSION EDITOR'}</span><h2>{template ? 'Level template' : 'Today’s workout'}</h2>
        <p className="muted" role="status">{template ? 'Warmup and finisher templates are shared across levels.'
          : failed ? 'Draft sync failed.' : dirty ? 'Unsynced edits' : state.drafts[level.id] ? 'Draft saved to Supabase' : 'Ready to log'}</p>
      </div>
      <button disabled={busy} onClick={() => setTemplate(template ? undefined : startWorkout(state))}>
        {template ? 'Cancel edits' : 'Edit level'}
      </button>
      {failed && !template && <button disabled={busy || !validWorkout(draft)} onClick={persistDraft}>Retry draft sync</button>}
    </div>
    {previousError && <p className="error" role="alert">Previous results could not load. {previousError}</p>}
    {groups.map(group => <ExerciseGroup key={group} group={group} entries={editing[group]}
      kg={state.equipment.kg} bells={state.equipment.count} previous={previous} baseline={state.baseline}
      change={entries => {
        const next = { ...editing, [group]: entries };
        if (template) setTemplate(next);
        else {
          draftRef.current = next;
          setDraft(next);
          setDirty(true);
          setFailed(false);
        }
      }} />)}
    <div className="save-bar">
      <span className="muted">{validWorkout(editing) ? (template ? 'Applies to new workouts' : 'Save your actual sets and reps') : 'Enter a weight and valid reps for each set.'}</span>
      {template ? <button className="primary" disabled={busy || !validWorkout(template)} onClick={async () => {
        const saved = await update(next => {
          next.warmup = template.warmup;
          next.finisher = template.finisher;
          next.levels[next.active].main = template.main;
        });
        if (saved) {
          setTemplate(undefined);
          if (!dirty && !state.drafts[level.id]) {
            const next = { ...template, id: draft.id };
            draftRef.current = next;
            setDraft(next);
          }
          setNotice('Level template saved.');
        }
      }}>Save template</button> : <button className="primary" disabled={busy || !validWorkout(draft)}
        onClick={() => complete(draft)}>Save workout</button>}
    </div>
  </>;
}

function Catalog({ state, busy, update }: { state: Tracker; busy: boolean; update: Update }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'All'>('All');
  const learned = skills.filter(item => status(state, item.id) === 'Learned').length;
  const learning = skills.filter(item => status(state, item.id) === 'Learning').length;
  const shown = skills.filter(item => `${item.id} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase())
    && (filter === 'All' || status(state, item.id) === filter));
  return <>
    <section className="hero">
      <span className="eyebrow">SKILL TREE</span><h1>Exercises<span>.</span></h1>
      <p>{learned} learned · {learning} learning · {skills.length} catalog skills</p>
      <progress aria-label="Skills learned" value={learned} max={skills.length} />
    </section>
    <div className="filters">
      <label>Search exercises<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or ID" /></label>
      <label>Skill status<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        <option>All</option>{statuses.map(value => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    <p className="muted">{shown.length} exercises</p>
    <div className="catalog-grid">{shown.map(item => {
      const current = status(state, item.id);
      return <article className="panel catalog-card" key={item.id}>
        <div className="exercise-heading"><span className="eyebrow">{item.id}</span><span className={`pill ${current === 'Learned' ? 'learned' : ''}`}>{current}</span></div>
        <h2>{item.name}</h2>
        <p className="muted">{item.bells === 2 ? 'Two kettlebells · ' : ''}{item.url
          ? <a href={item.url} target="_blank" rel="noreferrer">{item.url.includes('/playlist?') ? 'Source playlist' : 'Watch on YouTube'} ↗</a>
          : 'Video unavailable'}</p>
        <div className="prerequisites"><span className="eyebrow">PREREQUISITES</span>
          {!item.requires.length && !item.external.length ? <span>None in source</span> : <>
            {item.requires.map(id => <span key={id}>{status(state, id) === 'Learned' ? '✓ ' : ''}{id} {byId[id].name}</span>)}
            {item.external.map(name => <span key={name}>{name} · outside catalog</span>)}
          </>}
        </div>
        <label>Skill status override<select aria-label={`${item.id} skill status override`} disabled={busy}
          value={state.overrides[item.id] ?? 'Auto'} onChange={event => {
            const value = event.target.value;
            void update(next => {
              if (value === 'Auto') delete next.overrides[item.id];
              else next.overrides[item.id] = value as Status;
            });
          }}>
          <option value="Auto">Automatic ({state.progress[item.id] ?? 'Not learned'})</option>
          {statuses.map(value => <option key={value}>{value}</option>)}
        </select></label>
      </article>;
    })}</div>
  </>;
}

function History({ baseline }: { baseline: Record<string, string> }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  async function page(offset: number) {
    setBusy(true);
    setError('');
    try {
      const rows = await loadHistory(offset);
      setSessions(old => offset ? [...old, ...rows] : rows);
      setMore(rows.length === 25);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  useEffect(() => { void page(0); }, []);
  return <>
    <section className="hero"><span className="eyebrow">SESSION ARCHIVE</span><h1>History<span>.</span></h1><p>Review actual sets, reps, and weight from saved workouts.</p></section>
    {error && <p className="error" role="alert">{error}</p>}
    {!busy && !error && !sessions.length && <p className="panel banner">No saved sessions yet. Your first logged workout will appear here.</p>}
    {sessions.map(session => <details className="panel session" key={session.id}>
      <summary><strong>{new Date(session.completed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong><span>Level {session.level}</span></summary>
      {groups.map(group => session.workout[group].length > 0 && <section key={group}>
        <h3>{groupNames[group]}</h3>
        {session.workout[group].map(item => <div className="result" key={item.id}><span>{byId[item.id].name}</span><strong>{summarize(item)}</strong></div>)}
      </section>)}
    </details>)}
    {busy && <p role="status">Loading history…</p>}
    {!busy && (more || error) && <button onClick={() => page(sessions.length)}>{error ? 'Retry history' : 'Load older workouts'}</button>}
    {Object.keys(baseline).length > 0 && <section className="panel baseline">
      <h2>Last known performance</h2><p className="muted">Starting reference · date unrecorded</p>
      {Object.entries(baseline).map(([id, result]) => <div className="result" key={id}><span>{byId[id].name}</span><strong>{result}</strong></div>)}
    </section>}
  </>;
}
