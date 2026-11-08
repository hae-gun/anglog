import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, RoomCard } from '../api';
import { BirdAvatar } from '../components/BirdAvatar';
import { Joystick } from '../components/Joystick';
import { ParrotForm } from '../components/ParrotForm';
import { GuestBird, loadGuestBird, saveGuestBird } from '../lib/guestBird';
import { timeAgo } from '../lib/image';
import { connectPark, NetClient, NetLook, NetPlayer, NetState, NetStatus, realtimeUrl } from '../lib/parkNet';
import { PHRASES } from '../lib/phrases';
import { isMuted, setMuted } from '../lib/sound';
import { mountPark } from '../room3d/park.js';
import { useSession } from '../session';

interface Controller {
  setInput(x: number, y: number): void;
  toggleFly(): boolean;
  setClimb(dir: number): void;
  isFlying(): boolean;
  chirp(): void;
  say(text: string): void;
  playTogether(): string | null;
  enter(handle: string): boolean;
  state(): NetState;
  addRemote(pid: number, look: NetLook, s: NetState): void;
  updateRemote(pid: number, s: NetState): void;
  lookRemote(pid: number, look: NetLook): void;
  removeRemote(pid: number): void;
  clearRemotes(): void;
  emoteRemote(pid: number, id: string): void;
  sayRemote(pid: number, text: string): void;
  dispose(): void;
}
type ParkCard = RoomCard & { mine?: boolean };
type BirdPop = { handle: string | null; nickname: string | null; birdName: string; remote: boolean };

const PARK_HOUSES = 12;
const INVITE_KEY = 'anglog-invite-seen';
const INVITE_AFTER_MS = 3 * 60 * 1000;

/** 앵파크: the autumn park game. Anyone can play without a login; bird owners are invited to 앵로그. */
export function ParkPage() {
  const { me, parrots, loading } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const startAt = useRef(params.get('at'));
  const stage = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const net = useRef<NetClient | null>(null);
  const others = useRef(new Map<number, NetPlayer>());
  const [rooms, setRooms] = useState<RoomCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState<GuestBird>(loadGuestBird);
  const [sheet, setSheet] = useState<null | 'list' | 'dress' | 'say'>(null);
  const [bird, setBird] = useState<BirdPop | null>(null);
  const [hint, setHint] = useState(true);
  const [muted, setMute] = useState(isMuted());
  const [toast, setToast] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [flying, setFlying] = useState(false);
  const [status, setStatus] = useState<NetStatus | null>(null);
  const [online, setOnline] = useState(1);
  const [invite, setInvite] = useState(false);

  const myBird = parrots[0] ?? null;
  const visitor = myBird ?? guest;
  const netLook: NetLook = { name: visitor.name, species: visitor.species, colors: visitor.colors, home: myBird && me ? me.handle : null };
  const lookRef = useRef(netLook);
  lookRef.current = netLook;

  useEffect(() => {
    let alive = true;
    api.exploreRooms()
      .then((r) => alive && setRooms(r))
      .catch(() => {
        // the park still opens without the diary API: empty lots, AI-less, but playable
        if (!alive) return;
        setRooms([]);
        setError('이웃집을 불러오지 못했어요. 공원에서는 그대로 놀 수 있어요.');
      });
    return () => { alive = false; };
  }, [me?.id]);

  // my house stands nearest the gate when I have a bird; the neighbours fill the rest
  const houses = useMemo<ParkCard[]>(() => {
    if (!rooms) return [];
    const mine: ParkCard[] = me && parrots.length
      ? [{ owner: me, parrots, coverImageUrl: null, latestPostAt: null, postedToday: false, following: false, featherLeftToday: false, mine: true }]
      : [];
    return [...mine, ...rooms].slice(0, PARK_HOUSES);
  }, [rooms, me, parrots]);

  // ---- the 3D park
  useEffect(() => {
    if (!rooms || loading || !stage.current) return;
    try {
      const c = mountPark(stage.current, houses, {
        visitor: { name: visitor.name, colors: visitor.colors, species: visitor.species },
        startAt: startAt.current,
        onEnter: (handle: string) => navigate(`/play/${handle}`),
        onBirdTap: (who: BirdPop) => setBird(who),
        onEmptyLot: () => setToast(
          me && parrots.length ? '새 이웃을 기다리는 빈 터예요.'
            : me ? '내 앵무를 등록하면 여기에 우리 집이 생겨요.'
              : '앵로그에 우리 앵무를 등록하면 여기에 집이 생겨요.'),
      }) as unknown as Controller;
      ctl.current = c;
      others.current.forEach((p) => c.addRemote(p.pid, p.look, p));
    } catch {
      setBroken(true);
    }
    startAt.current = null;
    if (params.has('at')) setParams({}, { replace: true });
    setHint(true);
    const t = setTimeout(() => setHint(false), 8000);
    const f = setInterval(() => setFlying(!!ctl.current?.isFlying()), 300);
    return () => {
      clearTimeout(t);
      clearInterval(f);
      ctl.current?.dispose();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houses, loading, visitor.name, visitor.colors.body, visitor.colors.head, visitor.colors.face, visitor.species]);

  // ---- other people, live
  const url = realtimeUrl();
  useEffect(() => {
    if (!url || loading) return;
    const map = others.current;
    const client = connectPark(url, lookRef.current, () => ctl.current?.state() ?? null, {
      status: setStatus,
      welcome(players, n) {
        ctl.current?.clearRemotes();
        map.clear();
        players.forEach((p) => { map.set(p.pid, p); ctl.current?.addRemote(p.pid, p.look, p); });
        setOnline(n);
      },
      joined(p) {
        map.set(p.pid, p);
        ctl.current?.addRemote(p.pid, p.look, p);
      },
      moved(pid, s) {
        const p = map.get(pid);
        if (p) Object.assign(p, s);
        ctl.current?.updateRemote(pid, s);
      },
      left(pid) {
        map.delete(pid);
        ctl.current?.removeRemote(pid);
      },
      look(pid, lk) {
        const p = map.get(pid);
        if (p) p.look = lk;
        ctl.current?.lookRemote(pid, lk);
      },
      emote: (pid, id) => ctl.current?.emoteRemote(pid, id),
      say: (pid, n) => { if (PHRASES[n]) ctl.current?.sayRemote(pid, PHRASES[n]); },
      online: setOnline,
    });
    net.current = client;
    return () => {
      client.close();
      net.current = null;
      map.clear();
      ctl.current?.clearRemotes();
    };
  }, [url, loading]);

  // when I dress up again, others see the new look without reconnecting
  useEffect(() => {
    net.current?.setLook(lookRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitor.name, visitor.colors.body, visitor.colors.head, visitor.colors.face, visitor.species, me?.handle]);

  // ---- 앵집사님이세요? once, a few minutes into playing without a bird of my own
  useEffect(() => {
    if (myBird || loading) return;
    let seen = false;
    try { seen = localStorage.getItem(INVITE_KEY) === '1'; } catch { /* private mode */ }
    if (seen) return;
    const t = setTimeout(() => {
      setInvite(true);
      try { localStorage.setItem(INVITE_KEY, '1'); } catch { /* private mode */ }
    }, INVITE_AFTER_MS);
    return () => clearTimeout(t);
  }, [myBird, loading]);

  useEffect(() => {
    if (!bird) return;
    const t = setTimeout(() => setBird(null), 6000);
    return () => clearTimeout(t);
  }, [bird]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  async function surf() {
    const next = await api.randomRoom(null);
    if (!next) return setToast('아직 놀러갈 집이 없어요.');
    if (!ctl.current?.enter(next)) navigate(`/play/${next}`);
  }
  function visit(handle: string) {
    setBird(null);
    if (!ctl.current?.enter(handle)) navigate(`/play/${handle}`);
  }
  const joinHref = me ? '/parrots/new' : '/login';

  const followed = rooms?.filter((r) => r.following) ?? [];
  const neighbours = rooms?.filter((r) => !r.following) ?? [];

  return (
    <div className="park">
      <div className="park-stage" ref={stage} aria-label="앵파크. 조이스틱이나 바닥을 눌러 걷고, 화면을 끌면 카메라가 돌아가요. 집 문을 누르면 그 집에 들어가요." />

      <div className="park-top">
        <Link to="/" className="play-chip park-brand"><span aria-hidden="true">←</span> 앵로그</Link>
        {status && (
          <span className={`play-chip park-online ${status}`} role="status">
            <span className="dot" aria-hidden="true" />
            {status === 'online' ? `${online}마리 노는 중` : status === 'connecting' ? '연결 중' : '혼자 노는 중'}
          </span>
        )}
        <span className="grow" />
        <button className="play-chip" onClick={() => { setMuted(!muted); setMute(!muted); }} aria-pressed={!muted}>{muted ? '소리 끔' : '소리 켬'}</button>
        <button className="play-chip" onClick={() => setSheet('list')}>집 목록</button>
      </div>

      {error && hint && <p className="play-note park-note" role="alert">{error}</p>}
      {broken && <p className="play-note park-note">이 기기에서는 3D 앵파크를 열 수 없어요. 집 목록으로 놀러가 주세요.</p>}
      {!rooms && !error && <p className="park-hint">앵파크 문 여는 중</p>}
      {rooms && hint && !broken && !bird && (
        <p className="park-hint">조이스틱이나 바닥을 눌러 걷고, 화면을 끌면 둘러봐요. 날기로 날아올라 위로, 아래로 높이를 바꾸고, 집 문을 누르면 들어가요.</p>
      )}

      {bird && (
        <div className="park-pop" role="status">
          <div>
            <b>{bird.birdName}</b>
            <span>{bird.remote ? (bird.handle ? '지금 같이 노는 앵무예요' : '지금 같이 노는 손님 앵무예요') : `${bird.nickname}의 집에 살아요`}</span>
          </div>
          {bird.handle && <button className="btn small primary" onClick={() => visit(bird.handle!)}>집에 놀러가기</button>}
          {bird.handle && <Link className="btn small" to={`/room/${bird.handle}`}>일기</Link>}
        </div>
      )}

      {invite && (
        <div className="park-invite" role="dialog" aria-label="앵로그 안내">
          <b>혹시 앵집사님이세요?</b>
          <p>우리 앵무를 앵로그에 등록하면 앵파크에 우리 집이 생기고, 일기를 쓸수록 집이 꾸며져요. 지금 꾸민 모습도 그대로 가져가요.</p>
          <div className="row">
            <Link className="btn small primary" to={joinHref}>앵로그 시작하기</Link>
            <button className="btn small" onClick={() => setInvite(false)}>계속 놀기</button>
          </div>
        </div>
      )}

      {flying && (
        <div className="park-climb" role="group" aria-label="높이">
          {[[1, '위로'], [-1, '아래로']].map(([dir, label]) => (
            <button key={label} className="pbtn"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); ctl.current?.setClimb(dir as number); }}
              onPointerUp={() => ctl.current?.setClimb(0)}
              onPointerCancel={() => ctl.current?.setClimb(0)}
              onContextMenu={(e) => e.preventDefault()}>{label}</button>
          ))}
        </div>
      )}

      <div className="park-controls">
        <Joystick onChange={(x, y) => ctl.current?.setInput(x, y)} />
        <div className="park-buttons" role="group" aria-label="앵파크에서 놀기">
          <button className="pbtn fly" onClick={() => setFlying(!!ctl.current?.toggleFly())} aria-pressed={flying}>{flying ? '내리기' : '날기'}</button>
          <button className="pbtn" onClick={() => { ctl.current?.chirp(); net.current?.emote('chirp'); }}>짹짹</button>
          <button className="pbtn" onClick={() => setSheet('say')}>말하기</button>
          <button className="pbtn" onClick={() => {
            if (ctl.current?.playTogether() == null) setToast('근처에 같이 놀 앵무가 없어요.');
            else net.current?.emote('dance');
          }}>같이 놀기</button>
          {myBird && me
            ? <button className="pbtn small" onClick={() => { if (!ctl.current?.enter(me.handle)) navigate(`/play/${me.handle}`); }}>내 집</button>
            : <button className="pbtn small" onClick={() => setSheet('dress')}>꾸미기</button>}
          <button className="pbtn small" onClick={surf}>아무 집</button>
        </div>
      </div>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            aria-label={sheet === 'list' ? '집 목록' : sheet === 'say' ? '말하기' : '앵무 꾸미기'}>
            <button className="sheet-close btn ghost small" onClick={() => setSheet(null)}>닫기</button>

            {sheet === 'say' && (
              <>
                <h2 className="section-title">무슨 말을 할까요?</h2>
                <div className="phrases">
                  {PHRASES.map((p, i) => (
                    <button key={p} className="chip" onClick={() => { ctl.current?.say(p); net.current?.say(i); setSheet(null); }}>{p}</button>
                  ))}
                </div>
                <p className="hint">앵파크에서는 정해진 말만 할 수 있어요.</p>
              </>
            )}

            {sheet === 'dress' && (
              <>
                <h2 className="section-title">앵파크에서 쓸 내 앵무</h2>
                <p className="lede">로그인 없이도 이 모습으로 앵파크와 이웃집에 놀러가요. 이 기기에만 저장돼요.</p>
                <ParrotForm compact submitLabel="이 모습으로 놀기"
                  initial={{ name: guest.name === '손님' ? '' : guest.name, species: guest.species, colors: guest.colors, birthDate: null, adoptedDate: null }}
                  onSubmit={async (v) => {
                    const next = { name: v.name, species: v.species, colors: v.colors };
                    saveGuestBird(next);
                    setGuest(next);
                    setSheet(null);
                  }} />
                <div className="owner-pitch">
                  <b>실제로 키우는 앵무가 있나요?</b>
                  <p>앵로그에 등록하면 앵파크에 우리 집이 생기고, 매일 일기를 쓰면 집 창문에 불이 켜져요. 지금 꾸민 모습을 그대로 가져가요.</p>
                  <Link className="btn small primary" to={joinHref}>앵로그에 우리 앵무 등록하기</Link>
                </div>
              </>
            )}

            {sheet === 'list' && (
              <>
                {followed.length > 0 && (
                  <>
                    <h2 className="section-title">팔로우한 집</h2>
                    <div className="room-cards">{followed.map((r) => <Card key={r.owner.id} r={r} />)}</div>
                  </>
                )}
                <h2 className="section-title">{followed.length ? '이웃집' : '앵파크의 집들'}</h2>
                {neighbours.length > 0
                  ? <div className="room-cards">{neighbours.map((r) => <Card key={r.owner.id} r={r} />)}</div>
                  : <p className="lede">아직 이웃이 없어요. 친구에게 앵로그를 알려 주세요.</p>}
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast park-toast" role="status">{toast}</div>}
    </div>
  );
}

function Card({ r }: { r: RoomCard }) {
  const lead = r.parrots[0];
  return (
    <article className="room-card">
      <Link to={`/play/${r.owner.handle}`} className="room-card-cover" aria-label={`${r.owner.nickname}의 집에 놀러가기`}>
        {r.coverImageUrl ? <img src={r.coverImageUrl} alt="" loading="lazy" /> : <BirdAvatar colors={lead?.colors} species={lead?.species} />}
        {r.featherLeftToday ? <span className="room-card-flag">오늘 다녀옴</span> : r.postedToday ? <span className="room-card-flag">오늘 일기</span> : null}
      </Link>
      <div className="room-card-body">
        <Link to={`/room/${r.owner.handle}`} className="room-card-name">{r.owner.nickname}</Link>
        <span className="room-card-birds">{r.parrots.map((p) => p.name).join(', ')}</span>
        {r.latestPostAt && <span className="room-card-time">{timeAgo(r.latestPostAt)} 기록</span>}
        <Link to={`/play/${r.owner.handle}`} className="btn small leaf">놀러가기</Link>
      </div>
    </article>
  );
}
