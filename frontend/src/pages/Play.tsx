import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Room } from '../api';
import { loadGuestBird } from '../lib/guestBird';
import { isMuted, setMuted } from '../lib/sound';
import { mountPlay } from '../room3d/play.js';
import { useSession } from '../session';
import { tr } from '../i18n';

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
      .catch((e) => alive && setError(e instanceof Error ? e.message : tr('방을 불러오지 못했어요.', 'Could not load the room.')));
    return () => { alive = false; };
  }, [handle, me?.id]);

  useEffect(() => {
    if (!room || !stage.current || loading) return;
    try {
      // in my own house I am one of my birds, so that bird is not also sitting on the perch
      const scene = room.relation.isMe && me_bird ? { ...room, parrots: room.parrots.filter((p) => p.id !== me_bird.id) } : room;
      ctl.current = mountPlay(stage.current, scene, {
        visitor: { name: visitor.name, colors: visitor.colors, species: visitor.species },
        onFrameTap: (postId: number) => navigate(`/post/${postId}`),
      }) as Controller;
    } catch {
      setError(tr('이 기기에서는 3D 방을 열 수 없어요.', 'This device cannot open the 3D room.'));
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

  if (error) return <div className="page"><p className="error">{error}</p><Link className="btn" to="/visit">{tr('다른 방 찾기', 'Find another room')}</Link></div>;
  if (!room) return <div className="center">{tr('방에 들어가는 중', 'Entering the room')}</div>;

  const r = room;
  const isMe = r.relation.isMe;
  // the birds I can play with here (in my own house, not the one I am)
  const friends = isMe && me_bird ? r.parrots.filter((p) => p.id !== me_bird.id) : r.parrots;
  const hostName = friends[0]?.name;

  async function leaveFeather() {
    if (!me) return navigate('/login');
    try {
      await api.leaveFeather(r.owner.handle);
      ctl.current?.dropFeather(visitor.colors.body);
      setRoom({ ...r, relation: { ...r.relation, featherLeftToday: true } });
      setToast(tr('깃털을 놓고 왔어요. 방 주인이 볼 수 있어요.', 'You left a feather. The owner will see it.'));
    } catch (e) {
      setToast(e instanceof Error ? e.message : tr('깃털을 남기지 못했어요.', 'Could not leave a feather.'));
    }
  }

  async function surf() {
    setSurfing(true);
    try {
      const next = await api.randomRoom(r.owner.handle);
      if (next) navigate(`/play/${next}`);
      else setToast(tr('아직 다른 방이 없어요.', 'There are no other rooms yet.'));
    } finally {
      setSurfing(false);
    }
  }

  return (
    <div className="play">
      <div className="play-stage" ref={stage} aria-label={tr(`${r.owner.nickname}의 3D 방에서 노는 중. 바닥이나 횃대를 누르면 내 앵무가 이동해요.`, `Playing in ${r.owner.nickname}'s 3D room. Tap the floor or a perch to move your bird.`)}>
        <div className="play-top">
          <div className="row" style={{ gap: 6 }}>
            <Link to={`/park?at=${r.owner.handle}`} className="play-chip"><span aria-hidden="true">←</span> {tr('앵파크', 'Park')}</Link>
            <Link to={`/room/${r.owner.handle}`} className="play-chip">{tr('일기', 'Diary')}</Link>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="play-chip" onClick={() => { setMuted(!muted); setMute(!muted); }} aria-pressed={!muted}>
              {muted ? tr('소리 끔', 'Sound off') : tr('소리 켬', 'Sound on')}
            </button>
            <button className="play-chip strong" onClick={surf} disabled={surfing}>{tr('다른 집', 'Another house')}</button>
          </div>
        </div>
        {hint && (
          <p className="play-hint">
            {tr('바닥을 누르면 걸어가고, 횃대나 선반을 누르면 날아가요.', 'Tap the floor to walk, a perch or shelf to fly.')}
            {hostName ? tr(` ${hostName}를 누르면 인사해요.`, ` Tap ${hostName} to say hi.`) : ''}
            {tr(' 방울을 누르면 딸랑딸랑 놀아요.', ' Tap the bell to ring it.')}
            {r.relation.isMe && r.stats.postCount < 3 ? tr(` 일기를 ${3 - r.stats.postCount}편 더 쓰면 거울이 생겨요.`, ` Write ${3 - r.stats.postCount} more ${3 - r.stats.postCount === 1 ? 'diary' : 'diaries'} to get a mirror.`) : ''}
          </p>
        )}
        {!me_bird && (
          <p className="play-note">
            {me
              ? tr(<>{visitor.name}로 놀러왔어요. <Link to="/parrots/new">내 앵무를 등록</Link>하면 앵파크에 내 집도 생겨요.</>, <>Visiting as {visitor.name}. <Link to="/parrots/new">Add your parrot</Link> to get a house in the park.</>)
              : tr(<>로그인 없이 {visitor.name}로 놀러왔어요. <Link to="/login">로그인</Link>하면 깃털도 남길 수 있어요.</>, <>Visiting as {visitor.name} without logging in. <Link to="/login">Log in</Link> to leave feathers.</>)}
          </p>
        )}
      </div>

      {parrots.length > 1 && (
        <div className="chips play-birds" role="group" aria-label={tr('데려갈 앵무', 'Bird to bring')}>
          {parrots.map((p) => (
            <button key={p.id} className="chip" aria-pressed={visitor.name === p.name && me_bird?.id === p.id} onClick={() => setBirdId(p.id)}>{tr(`${p.name} 데려가기`, `Bring ${p.name}`)}</button>
          ))}
        </div>
      )}

      <div className="play-actions" role="group" aria-label={tr('놀기', 'Play')}>
        <button className="btn" onClick={() => ctl.current?.chirp()}>{tr('짹짹', 'Chirp')}</button>
        <button className="btn leaf" disabled={friends.length === 0}
          onClick={() => { const n = ctl.current?.playTogether(); if (n === null) setToast(tr('같이 놀 앵무가 없어요.', 'No bird to play with.')); }}>{tr('같이 놀기', 'Play together')}</button>
        <button className="btn" disabled={friends.length === 0}
          onClick={() => { const n = ctl.current?.preen(); if (n === null) setToast(tr('같이 놀 앵무가 없어요.', 'No bird to play with.')); }}>{tr('깃털 다듬기', 'Preen together')}</button>
        {!isMe && (
          <button className="btn primary" onClick={leaveFeather} disabled={r.relation.featherLeftToday}>
            {r.relation.featherLeftToday ? tr('오늘 남김', 'Left today') : tr('깃털 남기기', 'Leave a feather')}
          </button>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
