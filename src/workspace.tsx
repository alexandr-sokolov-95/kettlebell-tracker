import { useEffect, useRef, useState } from 'react';
import { client, loadHistory, loadPrevious, loadTracker, saveWorkout, writeTracker, type EntryResult, type Snapshot } from './api';
import { formatDate, localDate, statusNames, validDate } from './locale';
import { externalNames, russianNames } from './names';
import { ExerciseGroup, ExerciseName } from './editor';
import { Bell, message } from './ui';
import {
  advance, finishWorkout, groupNames, groups, newLevel, performedWorkout, skills, startWorkout, status,
  statuses, summarize, validWorkout, type Draft, type Session, type Status, type Tracker,
} from './tracker';

const tabs = ['Workout', 'Exercises', 'History'] as const;
type Tab = typeof tabs[number];
const tabLabels = { Workout: 'Тренировка', Exercises: 'Упражнения', History: 'История' };

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
    const performed = performedWorkout(workout);
    finishWorkout(state, performed);
    await saveWorkout(current.current!.version, state, previous + 1, performed);
    accept(await loadTracker());
    setHistoryVersion(version => version + 1);
    setEditorVersion(version => version + 1);
    setNotice(state.active !== previous ? `Тренировка сохранена. Доступен уровень ${state.active + 1}.` : 'Тренировка сохранена в истории.');
  });

  return <>
    <header className="masthead"><div className="shell topbar">
      <div className="wordmark"><span className="logo"><Bell /></span>Bell Log<span className="accent">.</span></div>
      <button className="signout" disabled={busy} onClick={async () => {
        const { error: failure } = await client!.auth.signOut();
        if (failure) setError(message(failure));
      }}>Выйти</button>
    </div></header>
    <div className="shell layout">
      <nav aria-label="Разделы дневника">
        {tabs.map(item => <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => { setTab(item); setNotice(''); }}>
          {tabLabels[item]}
        </button>)}
      </nav>
      <main>
        {error && <div className="panel error banner" role="alert">{error}
          {error.includes('Обновите') && <button onClick={async () => { await reload(); setEditorVersion(version => version + 1); }}>Обновить дневник</button>}
        </div>}
        {notice && <p className="panel banner" role="status">{notice}</p>}
        {!snapshot ? <div className="panel loading">{error ? <button onClick={reload}>Повторить подключение</button> : 'Загружаем дневник…'}</div> : <>
          <div hidden={tab !== 'Workout'}>
            <Workout key={`${snapshot.state.levels[snapshot.state.active].id}:${editorVersion}`} state={snapshot.state} busy={busy}
              update={update} complete={complete} historyVersion={historyVersion} setNotice={setNotice} />
          </div>
          {tab === 'Exercises' && <Catalog state={snapshot.state} busy={busy} update={update} />}
          {tab === 'History' && <History key={historyVersion} baseline={snapshot.state.baseline} />}
        </>}
      </main>
      <footer>Каталог адаптирован из проекта <a href="https://github.com/dznz/wildman-skill-trees/tree/67f44fa37ec9fabdcf67632b784fcc81698db77a/src/kb" target="_blank" rel="noreferrer">Wildman Skill Trees (dznz)</a> по материалам Марка Уайлдмана. © 2023 · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a></footer>
    </div>
  </>;
}

type Update = (apply: (state: Tracker) => void) => Promise<boolean>;

function Workout({ state, busy, update, complete, historyVersion, setNotice }: {
  state: Tracker; busy: boolean; update: Update; complete: (draft: Draft) => Promise<boolean>;
  historyVersion: number; setNotice: (text: string) => void;
}) {
  const level = state.levels[state.active];
  const [draft, setDraft] = useState(() => {
    const saved = state.drafts[level.id];
    return saved ? { ...saved, trainingDate: saved.trainingDate ?? localDate() } : startWorkout(state);
  });
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
        if (!validWorkout(draft)) throw new Error('Проверьте вес и повторения перед сменой уровня.');
        next.drafts[level.id] = draft;
      }
      if (direction === -1) next.active--;
      else if (blank) {
        next.levels.push(newLevel([]));
        next.active++;
      } else if (!advance(next)) {
        throw new Error('Нет новых упражнений, подходящих по навыкам и инвентарю. Создайте свой уровень или обновите статусы упражнений.');
      }
    });
  }

  const editing = template ?? draft;
  const hasCompletedSets = groups.some(group => draft[group].some(item => item.sets.some(set => set.completed)));
  const validTrainingDate = validDate(draft.trainingDate ?? '');
  function changeDraft(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    setDirty(true);
    setFailed(false);
  }
  return <>
    <section className="hero">
      <div className="hero-heading"><div><span className="eyebrow">ПЛАН ТРЕНИРОВОК</span>
        <h1>Уровень {state.active + 1}<span>.</span></h1><p>Основных упражнений: {level.main.length} · Гири: {state.equipment.count} × {state.equipment.kg} кг</p>
      </div><div className="hero-icon"><Bell /></div></div>
      <div className="meter-label"><span>Прогресс уровня</span><strong>{level.completed} из {level.goal} тренировок</strong></div>
      <progress value={Math.min(level.completed, level.goal)} max={level.goal} aria-label="Прогресс уровня" />
      <div className="button-row level-actions">
        <button disabled={busy || !!template || state.active === 0} onClick={() => changeLevel(-1)}>← Предыдущий</button>
        <button disabled={busy || !!template} onClick={() => update(next => { next.levels[next.active].goal = Math.max(level.goal, level.completed) + 1; })}>Продлить +1</button>
        <button disabled={busy || !!template} onClick={() => changeLevel(1)}>Следующий →</button>
      </div>
      {state.active + 1 === state.levels.length && <button className="text-button" disabled={busy || !!template}
        onClick={() => changeLevel(1, true)}>Создать свой следующий уровень</button>}
    </section>

    <div className="workout-toolbar">
      <div><span className="eyebrow">{template ? 'НАСТРОЙКИ УРОВНЯ' : 'ДНЕВНИК ТРЕНИРОВКИ'}</span><h2>{template ? 'Шаблон уровня' : 'Тренировка'}</h2>
        <p className="muted" role="status">{template ? 'Шаблоны разминки и дополнительных упражнений общие для всех уровней.'
          : failed ? 'Не удалось сохранить черновик.' : dirty ? 'Сохраняем изменения…' : state.drafts[level.id] ? 'Черновик сохранён' : 'Отмечайте выполненные подходы'}</p>
      </div>
      <button disabled={busy} onClick={() => setTemplate(template ? undefined : startWorkout(state))}>
        {template ? 'Отменить' : 'Изменить шаблон уровня'}
      </button>
      {failed && !template && <button disabled={busy || !validWorkout(draft)} onClick={persistDraft}>Повторить сохранение черновика</button>}
    </div>
    {previousError && <p className="error" role="alert">Не удалось загрузить предыдущие результаты. {previousError}</p>}
    {!template && <div className="panel workout-fields">
      <label>Дата тренировки<input type="date" value={draft.trainingDate ?? ''} required
        onChange={event => changeDraft({ ...draft, trainingDate: event.target.value })} /></label>
      <label>Заметки к тренировке<textarea rows={2} maxLength={5000} value={draft.notes ?? ''}
        onChange={event => changeDraft({ ...draft, notes: event.target.value })} /></label>
    </div>}
    {groups.map(group => <ExerciseGroup key={`${template ? 'template' : 'draft'}:${group}`} template={!!template} group={group} entries={editing[group]}
      kg={state.equipment.kg} bells={state.equipment.count} previous={previous} baseline={state.baseline}
      change={entries => {
        const next = { ...editing, [group]: entries };
        if (template) setTemplate(next);
        else changeDraft(next);
      }} />)}
    <div className="save-bar">
      <span className="muted">{!validWorkout(editing) ? 'Проверьте вес и повторения.' : template ? 'Применится к новым тренировкам' : !validTrainingDate ? 'Укажите дату тренировки.' : !hasCompletedSets ? 'Отметьте выполненный подход.' : 'Сохранятся выполненные подходы'}</span>
      {template ? <button className="primary" disabled={busy || !validWorkout(template)} onClick={async () => {
        const saved = await update(next => {
          next.warmup = template.warmup;
          next.finisher = template.finisher;
          next.levels[next.active].main = template.main;
        });
        if (saved) {
          setTemplate(undefined);
          if (!dirty && !state.drafts[level.id]) {
            const next = { ...template, id: draft.id, trainingDate: draft.trainingDate };
            draftRef.current = next;
            setDraft(next);
          }
          setNotice('Шаблон уровня сохранён.');
        }
      }}>Сохранить шаблон</button> : <button className="primary" disabled={busy || !validWorkout(draft) || !validTrainingDate || !hasCompletedSets}
        onClick={() => complete(draft)}>Сохранить тренировку</button>}
    </div>
  </>;
}

function Catalog({ state, busy, update }: { state: Tracker; busy: boolean; update: Update }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'All'>('All');
  const learned = skills.filter(item => status(state, item.id) === 'Learned').length;
  const learning = skills.filter(item => status(state, item.id) === 'Learning').length;
  const shown = skills.filter(item => `${item.id} ${item.name} ${russianNames[item.id]}`.toLowerCase().includes(query.trim().toLowerCase())
    && (filter === 'All' || status(state, item.id) === filter));
  return <>
    <section className="hero">
      <span className="eyebrow">ДЕРЕВО НАВЫКОВ</span><h1>Упражнения<span>.</span></h1>
      <p>Освоено: {learned} · Изучаю: {learning} · Всего: {skills.length}</p>
      <progress aria-label="Освоенные навыки" value={learned} max={skills.length} />
    </section>
    <div className="filters">
      <label>Поиск упражнений<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Название или код" /></label>
      <label>Статус навыка<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        <option value="All">Все</option>{statuses.map(value => <option key={value} value={value}>{statusNames[value]}</option>)}
      </select></label>
    </div>
    <p className="muted">Найдено упражнений: {shown.length}</p>
    <div className="catalog-grid">{shown.map(item => {
      const current = status(state, item.id);
      return <article className={`panel catalog-card status-${{ Learned: 'learned', Learning: 'learning', 'Not learned': 'unlearned' }[current]}`} key={item.id}>
        <div className="exercise-heading"><span className="eyebrow">{item.id}</span><span className={`pill ${current === 'Learned' ? 'learned' : ''}`}>{statusNames[current]}</span></div>
        <h2><ExerciseName id={item.id} /></h2>
        <p className="muted">{item.bells === 2 ? 'Две гири · ' : ''}{item.url
          ? <a href={item.url} target="_blank" rel="noreferrer">{item.url.includes('/playlist?') ? 'Плейлист' : 'Смотреть на YouTube'} ↗</a>
          : 'Видео недоступно'}</p>
        <div className="prerequisites"><span className="eyebrow">ПРЕДВАРИТЕЛЬНЫЕ НАВЫКИ</span>
          {!item.requires.length && !item.external.length ? <span>В источнике не указаны</span> : <>
            {item.requires.map(id => <span key={id}>{status(state, id) === 'Learned' ? '✓ ' : ''}{id} {russianNames[id]}</span>)}
            {item.external.map(name => <span key={name}>{externalNames[name]} · вне каталога</span>)}
          </>}
        </div>
        <label>Ручной статус<select aria-label={`${item.id} skill status override`} disabled={busy}
          value={state.overrides[item.id] ?? 'Auto'} onChange={event => {
            const value = event.target.value;
            void update(next => {
              if (value === 'Auto') delete next.overrides[item.id];
              else next.overrides[item.id] = value as Status;
            });
          }}>
          <option value="Auto">Автоматически ({statusNames[state.progress[item.id] ?? 'Not learned']})</option>
          {statuses.map(value => <option key={value} value={value}>{statusNames[value]}</option>)}
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
    <section className="hero"><span className="eyebrow">АРХИВ ТРЕНИРОВОК</span><h1>История<span>.</span></h1><p>Выполненные подходы, повторения и вес в каждой тренировке.</p></section>
    {error && <p className="error" role="alert">{error}</p>}
    {!busy && !error && !sessions.length && <p className="panel banner">Здесь появится ваша первая сохранённая тренировка.</p>}
    {sessions.map(session => <details className="panel session" key={session.id}>
      <summary><strong>{formatDate(session.completed_at, session.workout.trainingDate)}</strong><span>Уровень {session.level}</span></summary>
      {session.workout.notes?.trim() && <p className="session-notes">{session.workout.notes}</p>}
      {groups.map(group => session.workout[group].length > 0 && <section key={group}>
        <h3>{groupNames[group]}</h3>
        {session.workout[group].map(item => <div className="result" key={item.id}><span><ExerciseName id={item.id} /></span><strong>{summarize(item, true)}</strong></div>)}
      </section>)}
    </details>)}
    {busy && <p role="status">Загружаем историю…</p>}
    {!busy && (more || error) && <button onClick={() => page(sessions.length)}>{error ? 'Повторить загрузку' : 'Загрузить предыдущие тренировки'}</button>}
    {Object.keys(baseline).length > 0 && <section className="panel baseline">
      <h2>Последние известные результаты</h2><p className="muted">Исходные результаты · дата не указана</p>
      {Object.entries(baseline).map(([id, result]) => <div className="result" key={id}><span><ExerciseName id={id} /></span><strong>{result.replaceAll('each arm', 'на каждую руку')}</strong></div>)}
    </section>}
  </>;
}
