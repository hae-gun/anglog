import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, RoomCard } from '../api';
import { BirdAvatar } from '../components/BirdAvatar';
import { Joystick } from '../components/Joystick';
import { ParrotForm } from '../components/ParrotForm';
import { GuestBird, loadGuestBird, saveGuestBird } from '../lib/guestBird';
import { timeAgo } from '../lib/image';
import { connectPark, NetClient, NetLook, NetPlayer, NetSpot, NetState, NetStatus, PrankNo, realtimeUrl } from '../lib/parkNet';
import { PHRASES } from '../lib/phrases';
import { isMuted, setMuted } from '../lib/sound';
import { mountPark } from '../room3d/park.js';
import { useSession } from '../session';

interface Controller {
  setInput(x: number, y: number): void;
  toggleFly(): boolean;
  setView(v: 'third' | 'first'): 'third' | 'first';
  swapBird(v: { name: string; colors: NetLook['colors']; species: NetLook['species'] }): void;
  setClimb(dir: number): void;
  isFlying(): boolean;
  chirp(): void;
  snack(): 'ok' | 'wait' | 'busy';
  weather: 'rain' | 'snow' | 'clear';
  say(text: string): void;
  playTogether(): string | null;
  enter(handle: string): boolean;
  state(): NetState;
  addRemote(pid: number, look: NetLook, s: NetState): void;
  updateRemote(pid: number, s: NetState): void;
  lookRemote(pid: number, look: NetLook): void;
  removeRemote(pid: number): void;
  clearRemotes(): void;
  placeAt(spot: NetSpot): boolean;
  emoteRemote(pid: number, id: string): void;
  sayRemote(pid: number, text: string): void;
  prankTarget(): (Who & { calm: boolean }) | null;
  prank(k: number): { ok: boolean; why?: 'none' | 'calm'; name?: string };
  answer(who: Who, a: number): void;
  prankRemote(from: number, to: number | null, k: number): void;
  answerRemote(from: number, to: number | null, a: number): void;
  calmRemote(pid: number, on: boolean): void;
  dispose(): void;
}
/** A bird I can prank or that pranked me: a live player (pid) or a resident of a house (r0, r1...). */
interface Who { id: number | string; name: string; remote: boolean }
type Pranked = Who & { kind: number; back: boolean };
type ParkCard = RoomCard & { mine?: boolean };
type BirdPop = { handle: string | null; nickname: string | null; birdName: string; remote: boolean };

const PARK_HOUSES = 12;
const INVITE_KEY = 'anglog-invite-seen';
const INVITE_AFTER_MS = 3 * 60 * 1000;
const BIRD_KEY = 'anglog-park-bird';
const VIEW_KEY = 'anglog-park-view';
const CALM_KEY = 'anglog-park-calm';
const TUDAK_KEY = 'anglog-park-tudak';
const ANSWER_MS = 8000;

// what each prank is called on the button, and how it reads when it happens to me
const PRANKS = [
  { label: '콕 찌르기', did: '콕 찔렀어요' },
  { label: '밀치기', did: '밀쳤어요' },
  { label: '간식 뺏기', did: '간식을 뺏어 먹었어요' },
  { label: '머리 위에 올라타기', did: '머리 위에 올라탔어요' },
  { label: '다듬는 척 콕', did: '깃털을 다듬어 주는 척하다 콕 찔렀어요' },
];
const PRANK_NO: Record<PrankNo, string> = {
  calm: '지금은 장난 받지 않는 앵무예요.',
  far: '조금 더 가까이 가야 장난칠 수 있어요.',
  wait: '조금 있다가 다시 장난쳐요.',
  blocked: '계속 무시당해서 그 앵무한테는 잠깐 장난을 못 쳐요.',
  gone: '그 앵무는 벌써 떠났어요.',
};
/** 이/가 after a Korean name: by whether its last syllable ends in a consonant. */
function iGa(name: string) {
  const c = name.charCodeAt(name.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return `${name}${/[a-zA-Z]$/.test(name) ? '가' : '(이)가'}`;
  return `${name}${(c - 0xac00) % 28 ? '이' : '가'}`;
}
/** Today's back-and-forths with each bird, on this device: the 투닥 친구 of the day. */
function bumpTudak(name: string): number {
  const today = new Date().toLocaleDateString('sv-SE');
  let data: { day: string; counts: Record<string, number> } = { day: today, counts: {} };
  try {
    const old = JSON.parse(localStorage.getItem(TUDAK_KEY) || 'null');
    if (old && old.day === today) data = old;
  } catch { /* private mode or bad data */ }
  data.counts[name] = (data.counts[name] || 0) + 1;
  try { localStorage.setItem(TUDAK_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  return data.counts[name];
}
function topTudak(): { name: string; n: number } | null {
  try {
    const data = JSON.parse(localStorage.getItem(TUDAK_KEY) || 'null');
    if (!data || data.day !== new Date().toLocaleDateString('sv-SE')) return null;
    const best = Object.entries(data.counts as Record<string, number>).sort((p, q) => q[1] - p[1])[0];
    return best ? { name: best[0], n: best[1] } : null;
  } catch {
    return null;
  }
}
const readKey = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeKey = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

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
  const [sheet, setSheet] = useState<null | 'list' | 'dress' | 'say' | 'birds' | 'prank' | 'more'>(null);
  const [calm, setCalm] = useState(() => readKey(CALM_KEY) === '1');
  const calmRef = useRef(calm);
  calmRef.current = calm;
  const [pranked, setPranked] = useState<Pranked | null>(null);
  const [tudak, setTudak] = useState(topTudak);
  const [prankTarget, setPrankTarget] = useState<string | null>(null);
  const [bird, setBird] = useState<BirdPop | null>(null);
  const [hint, setHint] = useState(true);
  const [muted, setMute] = useState(isMuted());
  const [toast, setToast] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [flying, setFlying] = useState(false);
  const [status, setStatus] = useState<NetStatus | null>(null);
  // bumped by "여기서 다시 놀기" after another tab or device took my bird
  const [netRound, setNetRound] = useState(0);
  const [online, setOnline] = useState(1);
  const [invite, setInvite] = useState(false);
  const [birdId, setBirdId] = useState<number | null>(() => Number(readKey(BIRD_KEY)) || null);
  const [view, setView] = useState<'third' | 'first'>(() => (readKey(VIEW_KEY) === 'first' ? 'first' : 'third'));

  // owners with several birds pick which one walks in the park
  const myBird = parrots.find((p) => p.id === birdId) ?? parrots[0] ?? null;
  const visitor = myBird ?? guest;
  const visitorRef = useRef(visitor);
  visitorRef.current = visitor;
  const visitorKey = `${visitor.name}|${visitor.species}|${visitor.colors.face}|${visitor.colors.head}|${visitor.colors.body}|${visitor.colors.wing}|${visitor.colors.tail}`;
  const mountedKey = useRef('');
  const viewRef = useRef(view);
  viewRef.current = view;
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
      const v = visitorRef.current;
      const c = mountPark(stage.current, houses, {
        visitor: { name: v.name, colors: v.colors, species: v.species },
        startAt: startAt.current,
        onEnter: (handle: string) => navigate(`/play/${handle}`),
        onBirdTap: (who: BirdPop) => setBird(who),
        onPrank: (pid: number, k: number) => net.current?.prank(pid, k),
        onPranked: (who: Pranked) => {
          if (who.back) countTudak(who.name);
          // with pranks turned off, a live bird cannot reach me; a resident only answers my own pranks
          if (calmRef.current && who.remote) return;
          setPranked(who);
        },
        onAnswered: (who: Who & { answer: number }) => {
          setToast(who.answer === 1 ? `${iGa(who.name)} 화해했어요.` : `${iGa(who.name)} 흥 하고 날아갔어요.`);
        },
        onEmptyLot: () => setToast(
          me && parrots.length ? '새 이웃을 기다리는 빈 터예요.'
            : me ? '내 앵무를 등록하면 여기에 우리 집이 생겨요.'
              : '앵로그에 우리 앵무를 등록하면 여기에 집이 생겨요.'),
      }) as unknown as Controller;
      ctl.current = c;
      mountedKey.current = visitorKey;
      if (viewRef.current === 'first') c.setView('first');
      others.current.forEach((p) => { c.addRemote(p.pid, p.look, p); });
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
  }, [houses, loading]);

  // a different bird (switched, or the guest dressed up again) takes over on the spot, no reload
  useEffect(() => {
    if (!ctl.current || mountedKey.current === visitorKey) return;
    mountedKey.current = visitorKey;
    const v = visitorRef.current;
    ctl.current.swapBird({ name: v.name, colors: v.colors, species: v.species });
  }, [visitorKey]);

  // ---- other people, live
  const url = realtimeUrl();
  useEffect(() => {
    if (!url || loading) return;
    const map = others.current;
    const client = connectPark(url, lookRef.current, () => ctl.current?.state() ?? null, {
      status(st) {
        setStatus(st);
        if (st === 'replaced' || st === 'kicked') {
          map.clear();
          ctl.current?.clearRemotes();
        }
      },
      welcome(players, n, spot) {
        ctl.current?.clearRemotes();
        map.clear();
        if (spot) ctl.current?.placeAt(spot);
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
      prank: (from, to, k, toMe) => ctl.current?.prankRemote(from, toMe ? null : to, k),
      answer: (from, to, a, toMe) => ctl.current?.answerRemote(from, toMe ? null : to, a),
      calm: (pid, on) => {
        const p = map.get(pid);
        if (p) p.calm = on;
        ctl.current?.calmRemote(pid, on);
      },
      prankNo: (_to, why) => setToast(PRANK_NO[why] ?? '지금은 장난칠 수 없어요.'),
      say: (pid, n) => { if (PHRASES[n]) ctl.current?.sayRemote(pid, PHRASES[n]); },
      online: setOnline,
    }, calmRef.current, async () => {
      // a logged-in owner: one bird per account in the park, back where it last was
      if (!me) return null;
      return (await api.parkToken()).token;
    });
    net.current = client;
    return () => {
      client.close();
      net.current = null;
      map.clear();
      ctl.current?.clearRemotes();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, loading, me?.id, netRound]);

  // when I dress up again, others see the new look without reconnecting
  useEffect(() => {
    net.current?.setLook(lookRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorKey, me?.handle]);

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

  useEffect(() => {
    if (!pranked) return;
    const t = setTimeout(() => setPranked(null), ANSWER_MS);
    return () => clearTimeout(t);
  }, [pranked]);

  function countTudak(name: string) {
    const n = bumpTudak(name);
    setTudak(topTudak());
    if (n > 1) setToast(`오늘 ${name}랑 ${n}번째 투닥투닥!`);
  }
  function answerPrank(a: number) {
    if (!pranked) return;
    const who = pranked;
    setPranked(null);
    ctl.current?.answer(who, a);
    if (who.remote) net.current?.answer(who.id as number, a);
    if (a === 0) countTudak(who.name);
  }
  function doPrank(k: number) {
    setSheet(null);
    const r = ctl.current?.prank(k);
    if (!r) return;
    if (!r.ok) setToast(r.why === 'calm' ? `${r.name}는 지금 장난 받지 않아요.` : '근처에 장난칠 앵무가 없어요. 다른 앵무 곁으로 가 봐요.');
  }
  function toggleCalm() {
    const next = !calm;
    setCalm(next);
    writeKey(CALM_KEY, next ? '1' : '0');
    net.current?.setCalm(next);
    if (next) setPranked(null);
  }

  async function surf() {
    const next = await api.randomRoom(null);
    if (!next) return setToast('아직 놀러갈 집이 없어요.');
    if (!ctl.current?.enter(next)) navigate(`/play/${next}`);
  }
  function visit(handle: string) {
    setBird(null);
    if (!ctl.current?.enter(handle)) navigate(`/play/${handle}`);
  }
  const joinHref = me ? '/parrots/new' : '/login?mode=signup&next=/park';
  function toggleView() {
    const next = view === 'first' ? 'third' : 'first';
    setView(next);
    writeKey(VIEW_KEY, next);
    ctl.current?.setView(next);
  }
  function openPrank() {
    const t = ctl.current?.prankTarget();
    setPrankTarget(t ? t.name : null);
    setSheet('prank');
  }
  // the rest of the buttons live in one sheet, so the park stays in view
  const more: { label: string; run: () => void }[] = [
    { label: '말하기', run: () => setSheet('say') },
    { label: '같이 놀기', run: () => {
      setSheet(null);
      if (ctl.current?.playTogether() == null) setToast('근처에 같이 놀 앵무가 없어요.');
      else net.current?.emote('dance');
    } },
    { label: '간식', run: () => { setSheet(null); if (ctl.current?.snack() === 'wait') setToast('방금 줬어요. 다 먹고 나면 또 줘요.'); } },
    myBird && me
      ? { label: '내 집', run: () => { setSheet(null); if (!ctl.current?.enter(me.handle)) navigate(`/play/${me.handle}`); } }
      : { label: '꾸미기', run: () => setSheet('dress') },
    { label: '아무 집', run: () => { setSheet(null); surf(); } },
    { label: '집 목록', run: () => setSheet('list') },
    { label: view === 'first' ? '3인칭으로' : '1인칭으로', run: () => { setSheet(null); toggleView(); } },
    { label: muted ? '소리 켜기' : '소리 끄기', run: () => { setMuted(!muted); setMute(!muted); } },
  ];

  const followed = rooms?.filter((r) => r.following) ?? [];
  const neighbours = rooms?.filter((r) => !r.following) ?? [];

  return (
    <div className="park">
      <div className="park-stage" ref={stage} aria-label="앵파크. 조이스틱이나 바닥을 눌러 걷고, 화면을 끌면 카메라가 돌아가요. 집 문을 누르면 그 집에 들어가요." />

      <div className="park-top">
        <Link to="/feed" className="play-chip park-brand"><span aria-hidden="true">←</span> 앵로그</Link>
        {status && (
          <span className={`play-chip park-online ${status}`} role="status">
            <span className="dot" aria-hidden="true" />
            {status === 'online' ? `${online}마리 노는 중` : status === 'connecting' ? '연결 중' : status === 'replaced' ? '다른 곳에서 노는 중' : '혼자 노는 중'}
          </span>
        )}
        {tudak && <span className="play-chip park-tudak" title="오늘 가장 많이 투닥거린 앵무">투닥 친구 {tudak.name} {tudak.n}번</span>}
        <span className="grow" />
        {parrots.length > 1 && (
          <button className="play-chip park-me" onClick={() => setSheet('birds')} aria-label={`앵무 바꾸기, 지금은 ${visitor.name}`}>
            <span className="dot" style={{ background: visitor.colors.body }} aria-hidden="true" />{visitor.name}
          </button>
        )}
      </div>

      {error && hint && <p className="play-note park-note" role="alert">{error}</p>}
      {broken && <p className="play-note park-note">이 기기에서는 3D 앵파크를 열 수 없어요. 집 목록으로 놀러가 주세요.</p>}
      {!rooms && !error && <p className="park-hint">앵파크 문 여는 중</p>}
      {rooms && hint && !broken && !bird && (
        <p className="park-hint">조이스틱이나 바닥을 눌러 걷고, 화면을 끌면 둘러봐요. 날기로 날아올라 위로, 아래로 높이를 바꾸고, 집 문을 누르면 들어가요. 짹짹을 박자 맞춰 세 번 넘게 누르면 근처 앵무들이 따라 불러요.</p>
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

      {pranked && (
        <div className="park-prank" role="alertdialog" aria-label="장난에 답하기">
          <p><b>{iGa(pranked.name)}</b> {pranked.back ? '되받아쳤어요!' : `${PRANKS[pranked.kind]?.did ?? '장난쳤어요'}!`}</p>
          <div className="row">
            <button className="btn small primary" onClick={() => answerPrank(0)}>되받아치기</button>
            <button className="btn small" onClick={() => answerPrank(1)}>화해하기</button>
            <button className="btn small ghost" onClick={() => answerPrank(2)}>무시하고 날아가기</button>
          </div>
          <span className="park-prank-timer" style={{ animationDuration: `${ANSWER_MS}ms` }} key={`${pranked.id}-${pranked.kind}-${pranked.back}`} aria-hidden="true" />
        </div>
      )}

      {status === 'replaced' && (
        <div className="park-invite" role="dialog" aria-label="다른 곳에서 앵파크에 들어왔어요">
          <b>다른 곳에서 앵파크에 들어왔어요</b>
          <p>같은 계정의 앵무는 공원에 한 마리만 있을 수 있어서, 여기 있던 앵무는 그쪽으로 옮겨 갔어요. 여기서 다시 놀면 그 자리에서 이어서 나와요.</p>
          <div className="row">
            <button className="btn small primary" onClick={() => setNetRound((n) => n + 1)}>여기서 다시 놀기</button>
            <Link className="btn small" to="/feed">앵로그로 가기</Link>
          </div>
        </div>
      )}

      {status === 'kicked' && (
        <div className="park-invite" role="dialog" aria-label="공원에서 나오게 됐어요">
          <b>공원에서 잠시 나오게 됐어요</b>
          <p>운영자가 이 앵무를 공원에서 내보냈어요. 지금은 혼자 노는 공원이에요. 이름이나 행동이 다른 집사를 불편하게 했다면 다음에는 조심해 주세요.</p>
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
        <div className="park-actions" role="group" aria-label="앵파크에서 놀기">
          <button className="rbtn fly" onClick={() => setFlying(!!ctl.current?.toggleFly())} aria-pressed={flying}>{flying ? '내리기' : '날기'}</button>
          <button className="rbtn chirp" onClick={() => { ctl.current?.chirp(); net.current?.emote('chirp'); }}>짹짹</button>
          <button className="rbtn prank" onClick={openPrank}>장난</button>
          <button className="rbtn more" onClick={() => setSheet('more')} aria-label="더 보기: 말하기, 같이 놀기, 간식, 집, 시점, 소리">더보기</button>
        </div>
      </div>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            aria-label={sheet === 'list' ? '집 목록' : sheet === 'say' ? '말하기' : sheet === 'birds' ? '앵무 바꾸기' : sheet === 'prank' ? '장난치기' : sheet === 'more' ? '더 보기' : '앵무 꾸미기'}>
            <button className="sheet-close btn ghost small" onClick={() => setSheet(null)}>닫기</button>

            {sheet === 'birds' && (
              <>
                <h2 className="section-title">누구랑 놀까요?</h2>
                <div className="bird-pick">
                  {parrots.map((p) => (
                    <button key={p.id} className="bird-pick-item" aria-pressed={p.id === myBird?.id}
                      onClick={() => { setBirdId(p.id); writeKey(BIRD_KEY, String(p.id)); setSheet(null); }}>
                      <BirdAvatar colors={p.colors} species={p.species} />
                      <b>{p.name}</b>
                      <span>{p.speciesLabel}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet === 'more' && (
              <div className="park-more">
                {more.map((m) => <button key={m.label} className="pbtn" onClick={m.run}>{m.label}</button>)}
              </div>
            )}

            {sheet === 'prank' && (
              <>
                <h2 className="section-title">{prankTarget ? `${prankTarget}한테 장난치기` : '장난치기'}</h2>
                {!prankTarget && <p className="lede">근처에 앵무가 없어요. 다른 앵무 곁으로 가서 눌러 봐요.</p>}
                <div className="phrases">
                  {PRANKS.map((p, i) => (
                    <button key={p.label} className="chip" disabled={!prankTarget} onClick={() => doPrank(i)}>{p.label}</button>
                  ))}
                </div>
                <label className="park-calm">
                  <input type="checkbox" checked={calm} onChange={toggleCalm} />
                  <span>다른 앵무의 장난 받지 않기</span>
                </label>
                <p className="hint">장난을 받으면 되받아치거나, 화해하거나, 무시하고 날아갈 수 있어요. 두 번 연속 무시하면 그 앵무는 1분 동안 장난을 못 쳐요.</p>
              </>
            )}

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
