import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { AdminComment, AdminDay, AdminGuestbook, AdminOverview, AdminUser, ApiError, MetamoaEvent, ParkState, Post, SPECIES } from '../api/types';
import { useSession } from '../session';

// 관리: 앵로그(집사, 일기, 댓글, 방명록)와 앵파크(지금 노는 앵무). 서버의 ADMIN_HANDLES에 있는 아이디만 들어온다.

type Tab = 'overview' | 'posts' | 'talk' | 'users' | 'park';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '현황' },
  { id: 'posts', label: '일기' },
  { id: 'talk', label: '댓글' },
  { id: 'users', label: '집사' },
  { id: 'park', label: '앵파크' },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDay = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
const speciesLabel = (s: string) => SPECIES.find((x) => x.value === s)?.label ?? s;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : '문제가 생겼어요. 다시 시도해 주세요.');

export function AdminPage() {
  const { me, loading } = useSession();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (sessionStorage.getItem('anglog-admin-tab') as Tab) || 'overview';
    } catch {
      return 'overview';
    }
  });
  const pick = (t: Tab) => {
    setTab(t);
    try {
      sessionStorage.setItem('anglog-admin-tab', t);
    } catch {
      // private mode: just do not remember
    }
  };

  if (loading) return <div className="center">불러오는 중</div>;
  if (!me) return <Navigate to="/login" replace />;
  if (!me.admin) return <div className="page"><p className="empty">관리자만 볼 수 있어요.</p></div>;

  return (
    <div className="page admin">
      <h1 className="page-title">관리</h1>
      <div className="tabs admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className="tab" role="tab" aria-selected={tab === t.id} onClick={() => pick(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'posts' && <Posts />}
      {tab === 'talk' && <Talk />}
      {tab === 'users' && <Users />}
      {tab === 'park' && <Park />}
    </div>
  );
}

// ---- 현황 -------------------------------------------------------------------

function Overview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.admin.overview().then(setData).catch((e) => setError(errText(e)));
  }, []);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!data) return <p className="muted">불러오는 중</p>;
  const t = data.totals;
  const today = data.days[data.days.length - 1];
  const tiles: [string, number, string?][] = [
    ['오늘 활동한 집사', today.active],
    ['오늘 가입', today.signups],
    ['오늘 일기', today.posts],
    ['앵파크 지금', data.park?.online ?? 0, data.park ? undefined : '연결 안 됨'],
    ['앵파크 오늘 방문', data.park?.today.visitors ?? 0, data.park ? `최고 동시 ${data.park.today.peak}` : undefined],
    ['집사', t.users, t.suspended ? `정지 ${t.suspended}` : undefined],
    ['앵무', t.parrots],
    ['일기', t.posts],
    ['댓글', t.comments],
    ['방명록', t.guestbook],
    ['깃털', t.feathers],
  ];
  return (
    <>
      <div className="admin-tiles">
        {tiles.map(([label, n, sub]) => (
          <div className="admin-tile" key={label}>
            <span className="admin-tile-label">{label}</span>
            <b>{n.toLocaleString('ko-KR')}</b>
            {sub && <span className="admin-tile-sub">{sub}</span>}
          </div>
        ))}
      </div>
      {data.parkError && <p className="muted">앵파크: {data.parkError}</p>}
      <div className="admin-charts">
        <DayBars title="활동한 집사" note="로그인하고 앵로그나 앵파크를 쓴 사람" days={data.days} pick={(d) => d.active} />
        <DayBars title="가입" note="최근 14일" days={data.days} pick={(d) => d.signups} />
        <DayBars title="일기" note="최근 14일" days={data.days} pick={(d) => d.posts} />
      </div>
      {data.park && (
        <p className="muted admin-note">
          앵파크 숫자는 서버 메모리에만 있어서 실시간 서버를 다시 띄우면 처음부터 셉니다(이번 기록 시작 {when(data.park.today.since)}).
          방문은 주소 기준이라 로그인 안 한 손님도 들어갑니다.
        </p>
      )}
    </>
  );
}

/** One measure over the last 14 days. A single series: the title names it, no legend. */
function DayBars({ title, note, days, pick }: { title: string; note?: string; days: AdminDay[]; pick: (d: AdminDay) => number }) {
  const [hover, setHover] = useState<number | null>(null);
  // drawn at its real width so ticks stay 11px on a phone and on a wide screen alike
  const [W, setW] = useState(520);
  const box = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
  }, []);
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const H = 120, top = 10, bottom = 22, gap = 2;
  const bw = W / days.length;
  const shown = hover ?? days.length - 1;
  return (
    <section className="card admin-chart">
      <header>
        <h2>{title}</h2>
        <span><b>{values[shown]}</b> {shortDay(days[shown].date)}{hover == null ? ' 오늘' : ''}</span>
      </header>
      {note && <p className="muted">{note}</p>}
      <div ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} 최근 14일: ${days.map((d, i) => `${shortDay(d.date)} ${values[i]}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - bottom} y2={H - bottom} className="admin-axis" />
        {days.map((d, i) => {
          const h = ((H - top - bottom) * values[i]) / max;
          const x = i * bw + gap / 2;
          const y = H - bottom - h;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              {values[i] > 0 && (
                <path className={i === shown ? 'admin-bar on' : 'admin-bar'}
                  d={`M${x},${H - bottom} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, h)},${y} H${x + bw - gap - Math.min(4, h)} Q${x + bw - gap},${y} ${x + bw - gap},${y + Math.min(4, h)} V${H - bottom} Z`} />
              )}
              {(i % 2 === 1 || i === days.length - 1) && (
                <text x={i === days.length - 1 ? W : i * bw + bw / 2} y={H - 6} textAnchor={i === days.length - 1 ? 'end' : 'middle'} className="admin-tick">{shortDay(d.date)}</text>
              )}
            </g>
          );
        })}
      </svg>
      </div>
    </section>
  );
}

// ---- 공통: 더 불러오기 목록 ---------------------------------------------------------

function usePaged<T extends { id: number }>(load: (cursor: number | null) => Promise<{ items: T[]; nextCursor: number | null }>, deps: unknown[] = []) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const more = useCallback(async (cursor: number | null, reset = false) => {
    setBusy(true);
    setError('');
    try {
      const page = await load(cursor);
      setItems((old) => (reset ? page.items : [...old, ...page.items]));
      setNext(page.nextCursor);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    more(null, true);
  }, [more]);
  const drop = (id: number) => setItems((old) => old.filter((x) => x.id !== id));
  const replace = (row: T) => setItems((old) => old.map((x) => (x.id === row.id ? row : x)));
  return { items, next, busy, error, more, drop, replace };
}

function MoreButton({ next, busy, more }: { next: number | null; busy: boolean; more: (c: number | null) => void }) {
  if (next == null) return null;
  return <button className="btn block" disabled={busy} onClick={() => more(next)}>{busy ? '불러오는 중' : '더 보기'}</button>;
}

function useConfirmDelete() {
  const [busyId, setBusyId] = useState<number | null>(null);
  const run = async (id: number, question: string, call: () => Promise<void>, done: () => void) => {
    if (!window.confirm(question)) return;
    setBusyId(id);
    try {
      await call();
      done();
    } catch (e) {
      window.alert(errText(e));
    } finally {
      setBusyId(null);
    }
  };
  return { busyId, run };
}

// ---- 일기 -------------------------------------------------------------------

function Posts() {
  const list = usePaged<Post>((c) => api.admin.posts(c));
  const del = useConfirmDelete();
  return (
    <>
      <p className="muted">새 일기부터. 지우면 사진, 좋아요, 댓글도 함께 지워지고 되돌릴 수 없어요.</p>
      {list.error && <p className="error" role="alert">{list.error}</p>}
      {list.items.map((p) => (
        <article className="card admin-row" key={p.id}>
          {p.images[0] && <img className="admin-thumb" src={p.images[0].url} alt="" loading="lazy" />}
          <div className="admin-row-main">
            <div className="admin-meta">
              <Link to={`/room/${p.author.handle}`}>{p.author.nickname} @{p.author.handle}</Link>
              <span>{when(p.createdAt)}</span>
              {p.images.length > 1 && <span>사진 {p.images.length}</span>}
              <span>댓글 {p.commentCount}</span>
            </div>
            <p className="admin-body">{p.body || <i className="muted">(글 없이 사진만)</i>}</p>
            <div className="row">
              <Link className="btn small" to={`/post/${p.id}`}>열기</Link>
              <button className="btn small danger" disabled={del.busyId === p.id}
                onClick={() => del.run(p.id, `@${p.author.handle}의 일기를 지울까요? 되돌릴 수 없어요.`, () => api.admin.deletePost(p.id), () => list.drop(p.id))}>
                지우기
              </button>
            </div>
          </div>
        </article>
      ))}
      {!list.busy && !list.items.length && !list.error && <p className="empty">아직 일기가 없어요.</p>}
      <MoreButton next={list.next} busy={list.busy} more={list.more} />
    </>
  );
}

// ---- 댓글과 방명록 -------------------------------------------------------------

function Talk() {
  const [kind, setKind] = useState<'comments' | 'guestbook'>('comments');
  return (
    <>
      <div className="chips">
        <button className="chip" aria-pressed={kind === 'comments'} onClick={() => setKind('comments')}>댓글</button>
        <button className="chip" aria-pressed={kind === 'guestbook'} onClick={() => setKind('guestbook')}>방명록</button>
      </div>
      {kind === 'comments' ? <Comments /> : <Guestbook />}
    </>
  );
}

function Comments() {
  const list = usePaged<AdminComment>((c) => api.admin.comments(c));
  const del = useConfirmDelete();
  return (
    <>
      {list.error && <p className="error" role="alert">{list.error}</p>}
      {list.items.map((c) => (
        <TalkRow key={c.id} who={c.author} at={c.createdAt} body={c.body}
          where={<Link to={`/post/${c.postId}`}>일기 #{c.postId}</Link>}
          busy={del.busyId === c.id}
          onDelete={() => del.run(c.id, '이 댓글을 지울까요?', () => api.admin.deleteComment(c.id), () => list.drop(c.id))} />
      ))}
      {!list.busy && !list.items.length && !list.error && <p className="empty">아직 댓글이 없어요.</p>}
      <MoreButton next={list.next} busy={list.busy} more={list.more} />
    </>
  );
}

function Guestbook() {
  const list = usePaged<AdminGuestbook>((c) => api.admin.guestbook(c));
  const del = useConfirmDelete();
  return (
    <>
      {list.error && <p className="error" role="alert">{list.error}</p>}
      {list.items.map((g) => (
        <TalkRow key={g.id} who={g.author} at={g.createdAt} body={g.body}
          where={g.roomHandle ? <Link to={`/room/${g.roomHandle}`}>@{g.roomHandle}의 방</Link> : null}
          busy={del.busyId === g.id}
          onDelete={() => del.run(g.id, '이 방명록을 지울까요?', () => api.admin.deleteGuestbook(g.id), () => list.drop(g.id))} />
      ))}
      {!list.busy && !list.items.length && !list.error && <p className="empty">아직 방명록이 없어요.</p>}
      <MoreButton next={list.next} busy={list.busy} more={list.more} />
    </>
  );
}

function TalkRow({ who, at, body, where, busy, onDelete }: {
  who: { handle: string; nickname: string } | null; at: string; body: string; where: ReactNode; busy: boolean; onDelete: () => void;
}) {
  return (
    <article className="card admin-row">
      <div className="admin-row-main">
        <div className="admin-meta">
          {who ? <Link to={`/room/${who.handle}`}>{who.nickname} @{who.handle}</Link> : <span>지워진 집사</span>}
          <span>{when(at)}</span>
          {where}
        </div>
        <p className="admin-body">{body}</p>
      </div>
      <button className="btn small danger" disabled={busy} onClick={onDelete}>지우기</button>
    </article>
  );
}

// ---- 집사 -------------------------------------------------------------------

function Users() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const list = usePaged<AdminUser>((c) => api.admin.users(query, c), [query]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const toggle = async (u: AdminUser) => {
    let reason = '';
    if (!u.suspendedAt) {
      const answer = window.prompt(`@${u.handle} 계정을 정지할까요? 바로 로그아웃되고 다시 로그인할 수 없어요.\n이유(관리 기록용, 비워도 됨)`, '');
      if (answer === null) return;
      reason = answer;
    } else if (!window.confirm(`@${u.handle} 계정 정지를 풀까요?`)) {
      return;
    }
    setBusyId(u.id);
    try {
      list.replace(u.suspendedAt ? await api.admin.unsuspend(u.id) : await api.admin.suspend(u.id, reason));
    } catch (e) {
      window.alert(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input className="input" style={{ flex: '1 1 180px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="아이디나 닉네임" aria-label="집사 찾기" />
        <button className="btn">찾기</button>
      </form>
      {list.error && <p className="error" role="alert">{list.error}</p>}
      <div className="card admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>집사</th><th>가입</th><th>앵무</th><th>일기</th><th>마지막 활동</th><th /></tr>
          </thead>
          <tbody>
            {list.items.map((u) => (
              <tr key={u.id} className={u.suspendedAt ? 'off' : ''}>
                <td className="lead">
                  <Link to={`/room/${u.handle}`}>{u.nickname}</Link>
                  <span className="muted"> @{u.handle}</span>
                  {u.admin && <span className="admin-flag">관리자</span>}
                  {u.suspendedAt && <span className="admin-flag stop" title={u.suspendReason ?? ''}>정지{u.suspendReason ? `: ${u.suspendReason}` : ''}</span>}
                </td>
                <td data-label="가입">{shortDay(u.createdAt.slice(0, 10))}</td>
                <td data-label="앵무">{u.parrots}</td>
                <td data-label="일기">{u.posts}</td>
                <td data-label="마지막 활동">{u.lastActive ? shortDay(u.lastActive) : '-'}</td>
                <td>
                  {!u.admin && (
                    <button className={u.suspendedAt ? 'btn small' : 'btn small danger'} disabled={busyId === u.id} onClick={() => toggle(u)}>
                      {u.suspendedAt ? '정지 풀기' : '정지'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.busy && !list.items.length && !list.error && <p className="empty">{query ? '찾는 집사가 없어요.' : '아직 집사가 없어요.'}</p>}
      <MoreButton next={list.next} busy={list.busy} more={list.more} />
    </>
  );
}

// ---- 앵파크 -------------------------------------------------------------------

const KICK_MINUTES = [
  { m: 0, label: '내보내기만' },
  { m: 60, label: '1시간' },
  { m: 24 * 60, label: '하루' },
];

function Park() {
  const [state, setState] = useState<ParkState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(60);

  const load = useCallback(() => {
    api.admin.park().then((s) => { setState(s); setError(''); }).catch((e) => setError(errText(e)));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [load]);

  const kick = async (channel: number, pid: number, name: string) => {
    const how = minutes ? `${KICK_MINUTES.find((k) => k.m === minutes)?.label} 동안 같은 주소로는 못 들어와요.` : '바로 다시 들어올 수는 있어요.';
    if (!window.confirm(`'${name}' 앵무를 앵파크에서 내보낼까요? ${how}`)) return;
    setBusy(`${channel}:${pid}`);
    try {
      await api.admin.kick(channel, pid, minutes);
      load();
    } catch (e) {
      window.alert(errText(e));
    } finally {
      setBusy(null);
    }
  };

  if (error && !state) return <p className="error" role="alert">{error}</p>;
  if (!state) return <p className="muted">불러오는 중</p>;
  // several birds from one address: worth a look (the same person in many tabs, or a bot)
  const perAddr = new Map<string, number>();
  state.channels.forEach((c) => c.birds.forEach((b) => b.addr && perAddr.set(b.addr, (perAddr.get(b.addr) ?? 0) + 1)));

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="admin-tiles">
        <div className="admin-tile"><span className="admin-tile-label">지금</span><b>{state.online}</b><span className="admin-tile-sub">공원 {state.channels.length}곳, 한 곳에 {state.capacity}마리까지</span></div>
        <div className="admin-tile"><span className="admin-tile-label">오늘 방문</span><b>{state.today.visitors}</b><span className="admin-tile-sub">집사 {state.today.owners}</span></div>
        <div className="admin-tile"><span className="admin-tile-label">오늘 최고 동시</span><b>{state.today.peak}</b><span className="admin-tile-sub">입장 {state.today.hellos}번</span></div>
        <div className="admin-tile"><span className="admin-tile-label">막아 둔 주소</span><b>{state.banned}</b></div>
      </div>
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="muted">내보낼 때</span>
        <div className="chips">
          {KICK_MINUTES.map((k) => (
            <button key={k.m} className="chip" aria-pressed={minutes === k.m} onClick={() => setMinutes(k.m)}>{k.label}</button>
          ))}
        </div>
      </div>
      {state.channels.map((c) => (
        <section key={c.no} className="card admin-table-wrap">
          <h2 className="admin-sub">공원 {c.no} <span className="muted">{c.size}마리</span></h2>
          <table className="admin-table">
            <thead><tr><th>이름</th><th>종</th><th>누구</th><th>주소</th><th>들어온 시각</th><th /></tr></thead>
            <tbody>
              {c.birds.map((b) => (
                <tr key={b.pid}>
                  <td className="lead">{b.name}{b.calm && <span className="admin-flag">장난 안 받음</span>}</td>
                  <td data-label="종">{speciesLabel(b.species)}</td>
                  <td data-label="누구">{b.owner ? (b.home ? <Link to={`/room/${b.home}`}>@{b.home}</Link> : '집사') : '손님'}</td>
                  <td data-label="주소"><code>{b.addr ?? '-'}</code>{b.addr && (perAddr.get(b.addr) ?? 0) > 1 && <span className="admin-flag stop">{perAddr.get(b.addr)}마리</span>}</td>
                  <td data-label="들어온 시각">{b.since ? when(b.since) : '-'}</td>
                  <td>
                    <button className="btn small danger" disabled={busy === `${c.no}:${b.pid}`} onClick={() => kick(c.no, b.pid, b.name)}>내보내기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {!state.channels.some((c) => c.birds.length) && <p className="empty">지금 공원에 아무도 없어요.</p>}
      <Metamoa />
      <p className="muted admin-note">
        5초마다 새로 읽어요. 주소는 실제 주소가 아니라 짧게 바꾼 값이라, 같은 값이면 같은 곳에서 들어온 앵무예요.
        휴대폰 데이터로 들어온 사람들은 여러 명이 같은 주소를 쓰기도 해서, 오래 막으면 다른 사람까지 막힐 수 있어요.
      </p>
    </>
  );
}

// ---- 메타모아(metamoa.com) 목록: 소식과 이벤트. 접속자 수는 실시간 서버가 10분마다 보낸다 ----

const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

function Metamoa() {
  const [info, setInfo] = useState<{ enabled: boolean; spaceId: string } | null>(null);
  const [events, setEvents] = useState<MetamoaEvent[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState({ title: '', desc: '', from: todayKst(), to: todayKst(), dailyFrom: '21:00', dailyTo: '22:00', daily: true });

  useEffect(() => {
    api.admin.metamoa().then((i) => {
      setInfo(i);
      if (i.enabled) api.admin.metamoaEvents().then((r) => setEvents(r.events)).catch((e) => setMsg(errText(e)));
    }).catch((e) => setMsg(errText(e)));
  }, []);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg('');
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const postNews = () => run(async () => {
    const r = await api.admin.metamoaUpdate(text.trim());
    setText('');
    return `소식을 올렸어요.${r.shown_until ? ` ${when(r.shown_until)}까지 보여요.` : ''}`;
  });

  const addEvent = () => run(async () => {
    // a one-day event runs the whole day (Korea time); with daily hours it opens only in that window
    const body = {
      title: ev.title.trim(),
      ...(ev.desc.trim() ? { desc: ev.desc.trim() } : {}),
      starts_at: `${ev.from}T00:00:00+09:00`,
      ends_at: `${ev.to}T23:59:00+09:00`,
      ...(ev.daily ? { daily_from: ev.dailyFrom, daily_to: ev.dailyTo } : {}),
      url: 'https://anglog.nobody-asked.dev/park',
    };
    const r = await api.admin.metamoaAddEvent(body);
    setEvents((old) => [...old, r.event]);
    setEv((o) => ({ ...o, title: '', desc: '' }));
    return '이벤트를 올렸어요.';
  });

  const removeEvent = (id: string) => {
    if (!window.confirm('이 이벤트를 메타모아에서 내릴까요?')) return;
    run(async () => {
      await api.admin.metamoaDeleteEvent(id);
      setEvents((old) => old.filter((x) => x.id !== id));
      return '이벤트를 내렸어요.';
    });
  };

  if (!info) return null;
  return (
    <section className="card admin-metamoa">
      <h2 className="admin-sub">메타모아 <span className="muted">metamoa.com 목록</span></h2>
      {!info.enabled ? (
        <p className="muted">아직 연결 전이에요. 등록이 승인되고 소유자 확인을 마친 뒤, 서버의 infra/.env에 METAMOA_KEY와 METAMOA_SPACE_ID를 넣고 배포하면 여기서 소식과 이벤트를 올릴 수 있어요. 접속자 수는 그때부터 10분마다 자동으로 보내요.</p>
      ) : (
        <>
          <p className="muted">공간 {info.spaceId}. 접속자 수는 실시간 서버가 10분마다 보내요.</p>
          <label className="field">
            <span>새 소식 (하루 한 번, 200자 3줄까지, 7일 동안 보여요)</span>
            <textarea className="textarea" rows={3} maxLength={200} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="예: 앵무끼리 장난치기가 생겼어요. 콕 찌르고 밀치고 머리 위에 올라타 보세요" />
          </label>
          <div className="row">
            <button className="btn primary" disabled={busy || !text.trim() || text.split('\n').length > 3} onClick={postNews}>소식 올리기</button>
          </div>

          <h3 className="admin-sub3">이벤트</h3>
          {events.length ? (
            <ul className="admin-events">
              {events.map((e) => (
                <li key={e.id}>
                  <div>
                    <b>{e.title}</b>{e.desc && <span className="muted"> {e.desc}</span>}
                    <div className="muted">{when(e.starts_at)} ~ {when(e.ends_at)}{e.daily_from ? `, 매일 ${e.daily_from}~${e.daily_to}` : ''}</div>
                  </div>
                  <button className="btn small danger" disabled={busy} onClick={() => removeEvent(e.id)}>내리기</button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">올린 이벤트가 없어요. 진행 중이면 메타모아 첫 화면에 「지금 이벤트 진행 중」으로 떠요.</p>}
          <div className="admin-event-form">
            <input className="input" maxLength={30} value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="제목 (30자)" aria-label="이벤트 제목" />
            <input className="input" maxLength={40} value={ev.desc} onChange={(e) => setEv({ ...ev, desc: e.target.value })} placeholder="한 줄 설명 (40자, 링크 안 됨)" aria-label="이벤트 설명" />
            <div className="row">
              <label className="field"><span>시작일</span><input className="input" type="date" value={ev.from} onChange={(e) => setEv({ ...ev, from: e.target.value })} /></label>
              <label className="field"><span>끝나는 날</span><input className="input" type="date" value={ev.to} onChange={(e) => setEv({ ...ev, to: e.target.value })} /></label>
            </div>
            <label className="admin-check"><input type="checkbox" checked={ev.daily} onChange={(e) => setEv({ ...ev, daily: e.target.checked })} /> 매일 정해진 시각에만</label>
            {ev.daily && (
              <div className="row">
                <label className="field"><span>매일 시작</span><input className="input" type="time" value={ev.dailyFrom} onChange={(e) => setEv({ ...ev, dailyFrom: e.target.value })} /></label>
                <label className="field"><span>매일 끝</span><input className="input" type="time" value={ev.dailyTo} onChange={(e) => setEv({ ...ev, dailyTo: e.target.value })} /></label>
              </div>
            )}
            <button className="btn" disabled={busy || !ev.title.trim() || ev.to < ev.from || (ev.daily && ev.dailyFrom === ev.dailyTo)} onClick={addEvent}>이벤트 올리기</button>
          </div>
        </>
      )}
      {msg && <p className="admin-msg" role="status">{msg}</p>}
    </section>
  );
}
