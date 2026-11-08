import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Room } from '../api';
import { loadGuestBird } from '../lib/guestBird';
import { isMuted, setMuted } from '../lib/sound';
import { mountPlay } from '../room3d/play.js';
import { useSession } from '../session';

interface Controller {
  chirp(): void;
  playTogether(): string | null;
  preen(): string | null;
  dropFeather(color: string): void;
  dispose(): void;
}

export function PlayPage() {
  const { handle = '' } = useParams();
  const { me, parrots, loading } = useSession();
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [birdId, setBirdId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState(true);
  const [muted, setMute] = useState(isMuted());
  const [surfing, setSurfing] = useState(false);
  const [guest] = useState(loadGuestBird);

  const me_bird = parrots.find((p) => p.id === birdId) ?? parrots[0] ?? null;
  const visitor = me_bird ?? guest;

  useEffect(() => {
    let alive = true;
    setRoom(null);
    setError(null);
    api.room(handle)
      .then((r) => alive && setRoom(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '방을 불러오지 못했어요.'));
    return () => { alive = false; };
  }, [handle, me?.id]);

  useEffect(() => {
    if (!room || !stage.current || loading) return;
    try {
      ctl.current = mountPlay(stage.current, room, {
        visitor: { name: visitor.name, colors: visitor.colors, species: visitor.species },
        onFrameTap: (postId: number) => navigate(`/post/${postId}`),
      }) as Controller;
    } catch {
      setError('이 기기에서는 3D 방을 열 수 없어요.');
    }
    setHint(true);
    const t = setTimeout(() => setHint(false), 7000);
    return () => {
      clearTimeout(t);
      ctl.current?.dispose();
      ctl.current = null;
    };
    // visitor identity is part of the scene
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, loading, visitor.name, visitor.colors.body]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (error) return <div className="page"><p className="error">{error}</p><Link className="btn" to="/visit">다른 방 찾기</Link></div>;
  if (!room) return <div className="center">방에 들어가는 중</div>;

  const r = room;
  const isMe = r.relation.isMe;
  const hostName = r.parrots[0]?.name;

  async function leaveFeather() {
    if (!me) return navigate('/login');
    try {
      await api.leaveFeather(r.owner.handle);
      ctl.current?.dropFeather(visitor.colors.body);
      setRoom({ ...r, relation: { ...r.relation, featherLeftToday: true } });
      setToast('깃털을 놓고 왔어요. 방 주인이 볼 수 있어요.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : '깃털을 남기지 못했어요.');
    }
  }

  async function surf() {
    setSurfing(true);
    try {
      const next = await api.randomRoom(r.owner.handle);
      if (next) navigate(`/play/${next}`);
      else setToast('아직 다른 방이 없어요.');
    } finally {
      setSurfing(false);
    }
  }

  return (
    <div className="play">
      <div className="play-stage" ref={stage} aria-label={`${r.owner.nickname}의 3D 방에서 노는 중. 바닥이나 횃대를 누르면 내 앵무가 이동해요.`}>
        <div className="play-top">
          <div className="row" style={{ gap: 6 }}>
            <Link to={`/park?at=${r.owner.handle}`} className="play-chip"><span aria-hidden="true">←</span> 앵파크</Link>
            <Link to={`/room/${r.owner.handle}`} className="play-chip">일기</Link>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="play-chip" onClick={() => { setMuted(!muted); setMute(!muted); }} aria-pressed={!muted}>
              {muted ? '소리 끔' : '소리 켬'}
            </button>
            <button className="play-chip strong" onClick={surf} disabled={surfing}>다른 집</button>
          </div>
        </div>
        {hint && (
          <p className="play-hint">
            바닥을 누르면 걸어가고, 횃대나 선반을 누르면 날아가요.
            {hostName ? ` ${hostName}를 누르면 인사해요.` : ''}
          </p>
        )}
        {!me_bird && (
          <p className="play-note">
            {me
              ? <>{visitor.name}로 놀러왔어요. <Link to="/parrots/new">내 앵무를 등록</Link>하면 앵파크에 내 집도 생겨요.</>
              : <>로그인 없이 {visitor.name}로 놀러왔어요. <Link to="/login">로그인</Link>하면 깃털도 남길 수 있어요.</>}
          </p>
        )}
      </div>

      {parrots.length > 1 && (
        <div className="chips play-birds" role="group" aria-label="데려갈 앵무">
          {parrots.map((p) => (
            <button key={p.id} className="chip" aria-pressed={visitor.name === p.name && me_bird?.id === p.id} onClick={() => setBirdId(p.id)}>{p.name} 데려가기</button>
          ))}
        </div>
      )}

      <div className="play-actions" role="group" aria-label="놀기">
        <button className="btn" onClick={() => ctl.current?.chirp()}>짹짹</button>
        <button className="btn leaf" disabled={r.parrots.length === 0}
          onClick={() => { const n = ctl.current?.playTogether(); if (n === null) setToast('이 방에는 아직 앵무가 없어요.'); }}>같이 놀기</button>
        <button className="btn" disabled={r.parrots.length === 0}
          onClick={() => { const n = ctl.current?.preen(); if (n === null) setToast('이 방에는 아직 앵무가 없어요.'); }}>깃털 다듬기</button>
        {!isMe && (
          <button className="btn primary" onClick={leaveFeather} disabled={r.relation.featherLeftToday}>
            {r.relation.featherLeftToday ? '오늘 남김' : '깃털 남기기'}
          </button>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
