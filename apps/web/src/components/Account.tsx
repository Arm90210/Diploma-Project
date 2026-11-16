import { useState, type FormEvent } from 'react';
import { api, type User } from '../lib/api';
import { Icon } from './Icon';
import { Modal } from './Modal';
export function Account({ mode: initialMode, close, signedIn }: { mode: 'login'|'register'; close: () => void; signedIn: (user: User) => void }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); setError(''); setBusy(true);
    try {
      if (mode === 'register') {
        if ([...password].length < 15 || [...password].length > 128) throw new Error('Choose a password between 15 and 128 characters.');
        await api('/auth/register', 'POST', { email, password, username: values.get('username'), displayName: values.get('displayName') });
        setMode('login'); setPassword(''); setNotice('Your account is ready. Sign in to make yourself at home.');
      } else { const result = await api<{user:User}>('/auth/login','POST',{ email,password }); signedIn(result.user); close(); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <Modal title={mode === 'login' ? 'Sign in' : 'Create an account'} close={close}>
    <div className="auth-symbol"><Icon name="headphones" size={30}/></div><p className="eyebrow">YOUR MUSIC. YOUR PEOPLE.</p>
    <h2>{mode === 'login' ? 'Welcome to your sphere.' : 'Find where you belong.'}</h2>
    <p className="muted">{mode === 'login' ? 'Sign in and pick up where you left off.' : 'Start with an account. A whole world of music awaits.'}</p>
    <form onSubmit={submit} className="form-stack">
      {notice && <p className="notice" role="status">{notice}</p>}
      {mode === 'register' && <><label>Display name<input name="displayName" autoComplete="name" required maxLength={100} placeholder="What should we call you?" /></label><label>Username<input name="username" autoComplete="username" required pattern="[A-Za-z0-9_]{3,40}" minLength={3} maxLength={40} placeholder="Your unique username"/><small>3–40 letters, numbers, or underscores.</small></label></>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
      <label>Password<div className="password-input"><input name="password" type={visible?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='register'?'At least 15 characters':'Your password'}/><button type="button" onClick={()=>setVisible(!visible)} aria-label={visible?'Hide password':'Show password'}>{visible?'Hide':'Show'}</button></div>{mode==='register'&&<small>A memorable phrase works well. Spaces are welcome.</small>}</label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <button className="primary wide" disabled={busy}>{busy?'Just a moment…':mode==='login'?'Sign in':'Create account'}<Icon name="arrow" size={17}/></button>
    </form>
    <p className="auth-switch">{mode==='login'?'New around here?':'Already in the sphere?'} <button onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setNotice('');setPassword('');}} disabled={busy}>{mode==='login'?'Create an account':'Sign in'}</button></p>
  </Modal>;
}
