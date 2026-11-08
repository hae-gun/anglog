import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isMock } from '../api';
import { useSession } from '../session';

export function LoginPage() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.devLogin(handle, nickname);
      await refresh();
      const birds = await api.myParrots();
      navigate(birds.length ? '/' : '/parrots/new', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <h1>우리 앵무의 하루를 기록하는 곳</h1>
        <p>사진과 체중, 기분을 적으면 내 앵무가 사는 방이 조금씩 채워져요. 다른 집 방에도 놀러가서 깃털을 남길 수 있어요.</p>
      </section>

      <form onSubmit={submit} className="page" style={{ padding: 0 }}>
        <div className="field">
          <label htmlFor="handle">아이디</label>
          <input id="handle" className="input" autoComplete="username" autoCapitalize="none" value={handle}
            onChange={(e) => setHandle(e.target.value)} placeholder="meoran_home" />
          <span className="hint">영어 소문자, 숫자, 밑줄로 3~20자. 내 방 주소가 돼요.</span>
        </div>
        <div className="field">
          <label htmlFor="nick">닉네임</label>
          <input id="nick" className="input" maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="머란이네" />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? '들어가는 중' : '시작하기'}</button>
        <p className="notice">
          지금은 개발용 로그인이라 비밀번호 없이 아이디만으로 들어가요. 카카오 로그인은 다음 단계에서 붙여요.
          {isMock && ' 가짜 서버 모드라서 새로고침하면 기록이 사라져요. haru, bori, kongi 방에 미리 써 둔 일기가 있어요.'}
        </p>
      </form>
    </div>
  );
}
