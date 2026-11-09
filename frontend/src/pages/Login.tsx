import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, isMock } from '../api';
import { useSession } from '../session';

/** Log in, or make an account (아이디 + 닉네임 + 비밀번호). */
export function LoginPage() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [handle, setHandle] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // only paths inside the app, so a link cannot send people elsewhere after logging in
  const next = (params.get('next') || '').startsWith('/') && !(params.get('next') || '').startsWith('//') ? params.get('next')! : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && password !== password2) {
      setError('비밀번호 두 칸이 서로 달라요.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await api.signUp(handle, nickname, password);
      else await api.login(handle, password);
      await refresh();
      const birds = await api.myParrots();
      navigate(birds.length ? next ?? '/feed' : '/parrots/new', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === 'signup';
  return (
    <div className="page">
      <section className="hero">
        <h1>우리 앵무의 하루를 기록하는 곳</h1>
        <p>사진과 체중, 기분을 적으면 내 앵무가 사는 방이 조금씩 채워지고, 앵파크에 우리 집이 생겨요. 다른 집에 놀러가서 깃털도 남길 수 있어요.</p>
      </section>

      <div className="chips" role="tablist" aria-label="로그인 또는 가입">
        <button role="tab" className="chip" aria-selected={!signup} aria-pressed={!signup} onClick={() => { setMode('login'); setError(null); }}>로그인</button>
        <button role="tab" className="chip" aria-selected={signup} aria-pressed={signup} onClick={() => { setMode('signup'); setError(null); }}>처음이에요</button>
      </div>

      <form onSubmit={submit} className="page" style={{ padding: 0 }}>
        <div className="field">
          <label htmlFor="handle">아이디</label>
          <input id="handle" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} value={handle}
            onChange={(e) => setHandle(e.target.value)} placeholder="meoran_home" required />
          {signup && <span className="hint">영어 소문자, 숫자, 밑줄로 3~20자. 내 방 주소가 돼요.</span>}
        </div>
        {signup && (
          <div className="field">
            <label htmlFor="nick">닉네임</label>
            <input id="nick" className="input" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="머란이네" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" type="password" className="input" autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={signup ? 8 : undefined} maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {signup && <span className="hint">8자 이상. 아이디와 다르게 정해 주세요.</span>}
        </div>
        {signup && (
          <div className="field">
            <label htmlFor="password2">비밀번호 한 번 더</label>
            <input id="password2" type="password" className="input" autoComplete="new-password" maxLength={64}
              value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '들어가는 중' : signup ? '가입하고 시작하기' : '로그인'}</button>
        <p className="notice">
          비밀번호는 암호화해서 저장해요. 카카오 로그인은 다음 단계에서 붙여요.
          {isMock && ' 가짜 서버 모드라서 새로고침하면 기록이 사라져요. haru, bori, kongi 계정의 비밀번호는 parrot123이에요.'}
        </p>
      </form>
    </div>
  );
}
