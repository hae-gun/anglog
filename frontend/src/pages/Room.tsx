import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GuestbookEntry, Post, Room } from '../api';
import { FeatherIcon } from '../components/Icons';
import { timeAgo } from '../lib/image';
import { mountRoom } from '../room3d/room.js';
import { useSession } from '../session';

export function RoomPage() {
  const { handle = '' } = useParams();
  const { me } = useSession();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postCursor, setPostCursor] = useState<number | null>(null);
  const [book, setBook] = useState<GuestbookEntry[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setRoom(null);
    setError(null);
    Promise.all([api.room(handle), api.roomPosts(handle), api.guestbook(handle)])
      .then(([r, p, g]) => {
        if (!alive) return;
        setRoom(r);
        setPosts(p.items);
        setPostCursor(p.nextCursor);
        setBook(g.items);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : '방을 불러오지 못했어요.'));
    return () => { alive = false; };
  }, [handle, me?.id]);

  // Mount the 3D room once the data is here; rebuild when the room data changes.
  useEffect(() => {
    if (!room || !stage.current) return;
    let handle3d: { dispose(): void } | null = null;
    try {
      handle3d = mountRoom(stage.current, room, { onFrameTap: (postId: number) => navigate(`/post/${postId}`) });
    } catch {
      // WebGL unavailable: the rest of the page still works.
    }
    return () => handle3d?.dispose();
  }, [room, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!room) return <div className="center">방에 들어가는 중</div>;

  const r = room;
  const isMe = r.relation.isMe;

  async function toggleFollow() {
    if (!me) return navigate('/login');
    try {
      const res = await api.follow(r.owner.handle, !r.relation.following);
      setRoom({ ...r, relation: { ...r.relation, following: res.following }, stats: { ...r.stats, followerCount: res.followerCount } });
    } catch (e) {
      setToast(e instanceof Error ? e.message : '팔로우하지 못했어요.');
    }
  }

  async function leaveFeather() {
    if (!me) return navigate('/login');
    try {
      const res = await api.leaveFeather(r.owner.handle);
      const myColor = (await api.myParrots())[0]?.colors.body ?? '#9BC9A0';
      setRoom({
        ...r,
        relation: { ...r.relation, featherLeftToday: true },
        stats: { ...r.stats, featherCount: res.featherCount, feathersToday: res.feathersToday },
        feathers: [{ color: myColor, visitorHandle: me.handle, visitDate: new Date().toISOString().slice(0, 10) }, ...r.feathers],
      });
      setToast('깃털을 남겼어요. 바닥을 봐요!');
    } catch (e) {
      setToast(e instanceof Error ? e.message : '깃털을 남기지 못했어요.');
    }
  }

  async function writeNote(e: FormEvent) {
    e.preventDefault();
    if (!me) return navigate('/login');
    if (!note.trim()) return;
    try {
      const entry = await api.writeGuestbook(r.owner.handle, note);
      setBook((prev) => [entry, ...prev]);
      setNote('');
    } catch (err) {
      setToast(err instanceof Error ? err.message : '방명록을 남기지 못했어요.');
    }
  }

  async function morePosts() {
    const p = await api.roomPosts(r.owner.handle, postCursor);
    setPosts((prev) => [...prev, ...p.items]);
    setPostCursor(p.nextCursor);
  }

  return (
    <div className="page">
      <div className="profile-head">
        <div>
          <h1>{r.owner.nickname}의 방</h1>
          <span className="handle">@{r.owner.handle}</span>
        </div>
        {isMe ? (
          <div className="row">
            <Link className="btn small" to="/parrots/new">앵무 추가</Link>
          </div>
        ) : (
          <button className={`btn small${r.relation.following ? '' : ' primary'}`} onClick={toggleFollow} aria-pressed={r.relation.following}>
            {r.relation.following ? '팔로잉' : '팔로우'}
          </button>
        )}
      </div>

      <div className="room-stage" ref={stage} aria-label={`${r.owner.nickname}의 3D 방. 벽의 액자를 누르면 그 일기가 열려요.`}>
        {r.frames.length > 0 && <span className="room-hint">액자를 누르면 일기가 열려요</span>}
      </div>

      <div className="stats">
        <div className="stat"><b>{r.stats.postCount}</b><span>일기</span></div>
        <div className="stat"><b>{r.stats.streakDays}</b><span>연속 기록</span></div>
        <div className="stat"><b>{r.stats.followerCount}</b><span>팔로워</span></div>
        <div className="stat"><b>{r.stats.featherCount}</b><span>깃털</span></div>
      </div>

      {r.parrots.length > 0 && (
        <div className="birds">
          {r.parrots.map((p) => (
            <span className="bird-chip" key={p.id}>
              <span className="dot" style={{ background: p.colors.body }} />
              {p.name}, {p.speciesLabel}
              {isMe && <Link to={`/parrots/${p.id}/edit`} style={{ marginLeft: 4, fontSize: 12 }}>고치기</Link>}
            </span>
          ))}
        </div>
      )}
      {r.badges.length > 0 && (
        <div className="badges" aria-label="선반 위 기념품">
          {r.badges.map((b) => <span className="badge" key={b.code + b.label}>{b.label}</span>)}
        </div>
      )}

      {!isMe && (
        <button className="btn leaf block" onClick={leaveFeather} disabled={r.relation.featherLeftToday}>
          <FeatherIcon /> {r.relation.featherLeftToday ? '오늘은 깃털을 남겼어요' : '놀러온 흔적으로 깃털 남기기'}
        </button>
      )}
      {isMe && r.stats.postCount === 0 && (
        <div className="empty">
          아직 방이 비어 있어요. 첫 일기를 쓰면 벽에 액자가 걸려요.
          <div style={{ marginTop: 10 }}><Link className="btn primary" to="/write">첫 일기 쓰기</Link></div>
        </div>
      )}

      <h2 className="section-title">방명록 {book.length}</h2>
      <form className="compose" onSubmit={writeNote}>
        <label htmlFor="note" hidden>방명록</label>
        <input id="note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={isMe ? '내 방에도 한마디 남길 수 있어요' : `${r.parrots[0]?.name ?? r.owner.nickname}에게 한마디`} />
        <button className="btn primary">남기기</button>
      </form>
      <ul className="list">
        {book.map((g) => (
          <li className="list-item" key={g.id}>
            <div className="content">
              <Link className="name" to={`/room/${g.author.handle}`}>{g.author.nickname}</Link>
              <span className="time">{timeAgo(g.createdAt)}</span>
              <p>{g.body}</p>
            </div>
            {g.canDelete && (
              <button className="btn ghost small" onClick={async () => {
                await api.deleteGuestbook(g.id);
                setBook((prev) => prev.filter((x) => x.id !== g.id));
              }}>지우기</button>
            )}
          </li>
        ))}
      </ul>

      <h2 className="section-title">일기 {r.stats.postCount}</h2>
      {posts.length === 0 ? (
        <p className="lede">아직 일기가 없어요.</p>
      ) : (
        <div className="grid">
          {posts.map((p) => (
            <Link key={p.id} to={`/post/${p.id}`} aria-label={p.body ? p.body.slice(0, 30) : '사진 일기'}>
              {p.images[0] ? <img src={p.images[0].url} alt="" loading="lazy" /> : <span className="text-tile">{p.body}</span>}
            </Link>
          ))}
        </div>
      )}
      {postCursor != null && <button className="btn" onClick={morePosts}>일기 더 보기</button>}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
