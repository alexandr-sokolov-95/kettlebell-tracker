import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { client } from './api';
import { Workspace } from './workspace';
import { Bell, message } from './ui';

import './style.css';

function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password') ?? '');
    const redirectTo = location.origin + location.pathname;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const auth = client!.auth;
      if (mode === 'reset') {
        const result = await auth.resetPasswordForEmail(email, { redirectTo });
        if (result.error) throw result.error;
        setNotice('Проверьте почту: мы отправили ссылку для сброса пароля.');
      } else if (mode === 'signup') {
        const result = await auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (result.error) throw result.error;
        if (!result.data.session) setNotice('Подтвердите адрес по ссылке из письма, затем войдите.');
      } else {
        const result = await auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const heading = { signin: 'Вход', signup: 'Регистрация', reset: 'Сброс пароля' }[mode];
  return <main className="auth">
    <div className="auth-intro"><span className="logo"><Bell /></span>
      <span className="eyebrow">ДНЕВНИК ТРЕНИРОВОК С ГИРЕЙ</span>
      <h1>Bell Log<span>.</span></h1>
      <p>Планируйте тренировки, осваивайте упражнения и сохраняйте результаты.</p>
    </div>
    <form className="panel auth-form" onSubmit={submit}>
      <h2>{heading}</h2>
      <label>Электронная почта<input name="email" type="email" autoComplete="email" required /></label>
      {mode !== 'reset' && <label>Пароль<input name="password" type="password" minLength={6}
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required /></label>}
      <button className="primary" disabled={busy || !client}>{busy ? 'Подождите…' : { signin: 'Войти', signup: 'Создать аккаунт', reset: 'Отправить ссылку' }[mode]}</button>
      {!client && <p role="alert">Сервис временно недоступен. Попробуйте позже.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="button-row">
        {mode === 'signin' ? <>
          <button type="button" className="text-button" onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>Создать аккаунт</button>
          <button type="button" className="text-button" onClick={() => { setMode('reset'); setError(''); setNotice(''); }}>Забыли пароль?</button>
        </> : <button type="button" className="text-button" onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>Вернуться ко входу</button>}
      </div>
    </form>
  </main>;
}

function App() {
  const [user, setUser] = useState<string | null | undefined>(client ? undefined : null);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setUser(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (user === undefined) return <main className="loading" role="status">Подключаемся к Bell Log…</main>;
  if (recovery) return <main className="auth"><form className="panel auth-form" onSubmit={async event => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    const result = await client!.auth.updateUser({ password });
    if (result.error) setError(message(result.error));
    else setRecovery(false);
  }}><h1>Установите новый пароль</h1><label>Новый пароль<input name="password" autoComplete="new-password" type="password" required minLength={6} /></label>
    <button className="primary">Сохранить пароль</button>{error && <p role="alert">{error}</p>}</form></main>;
  return user ? <Workspace key={user} /> : <Auth />;
}

createRoot(document.getElementById('root')!).render(<App />);
