import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GuestbookEntry, Post, Room, speciesName } from '../api';
import { FeatherIcon } from '../components/Icons';
import { timeAgo } from '../lib/image';
import { mountRoom } from '../room3d/room.js';
import { useSession } from '../session';
import { tr } from '../i18n';

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
      .catch((e) => alive && setError(e instanceof Error ? e.message : tr('방을 불러오지 못했어요.', 'Could not load the room.')));
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
  if (!room) return <div className="center">{tr('방에 들어가는 중', 'Entering the room')}</div>;

  const r = room;
  const isMe = r.relation.isMe;

  async function toggleFollow() {
    if (!me) return navigate('/login');
    try {
      const res = await api.follow(r.owner.handle, !r.relation.following);
      setRoom({ ...r, relation: { ...r.relation, following: res.following }, stats: { ...r.stats, followerCount: res.followerCount } });
    } catch (e) {
      setToast(e instanceof Error ? e.message : tr('팔로우하지 못했어요.', 'Could not follow.'));
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
      setToast(tr('깃털을 남겼어요. 바닥을 봐요!', 'Feather left. Look at the floor!'));
    } catch (e) {
      setToast(e instanceof Error ? e.message : tr('깃털을 남기지 못했어요.', 'Could not leave a feather.'));
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
      setToast(err instanceof Error ? err.message : tr('방명록을 남기지 못했어요.', 'Could not post to the guestbook.'));
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
          <h1>{tr(`${r.owner.nickname}의 방`, `${r.owner.nickname}'s room`)}</h1>
          <span className="handle">@{r.owner.handle}</span>
        </div>
        {isMe ? (
          <div className="row">
            <Link className="btn small" to="/parrots/new">{tr('앵무 추가', 'Add a parrot')}</Link>
          </div>
        ) : (
          <button className={`btn small${r.relation.following ? '' : ' primary'}`} onClick={toggleFollow} aria-pressed={r.relation.following}>
            {r.relation.following ? tr('팔로잉', 'Following') : tr('팔로우', 'Follow')}
          </button>
        )}
      </div>

      <div className="room-stage" ref={stage} aria-label={tr(`${r.owner.nickname}의 3D 방. 벽의 액자를 누르면 그 일기가 열려요.`, `${r.owner.nickname}'s 3D room. Tap a frame on the wall to open that diary.`)}>
        {r.frames.length > 0 && <span className="room-hint">{tr('액자를 누르면 일기가 열려요', 'Tap a frame to open the diary')}</span>}
      </div>

      <div className="stats">
        <div className="stat"><b>{r.stats.postCount}</b><span>{tr('일기', 'Diaries')}</span></div>
        <div className="stat"><b>{r.stats.streakDays}</b><span>{tr('연속 기록', 'Day streak')}</span></div>
        <div className="stat"><b>{r.stats.followerCount}</b><span>{tr('팔로워', 'Followers')}</span></div>
        <div className="stat"><b>{r.stats.featherCount}</b><span>{tr('깃털', 'Feathers')}</span></div>
      </div>

      {r.parrots.length > 0 && (
        <div className="birds">
          {r.parrots.map((p) => (
            <span className="bird-chip" key={p.id}>
              <span className="dot" style={{ background: p.colors.body }} />
              {p.name}, {speciesName(p.species)}
              {isMe && <Link to={`/parrots/${p.id}/edit`} style={{ marginLeft: 4, fontSize: 12 }}>{tr('고치기', 'Edit')}</Link>}
            </span>
          ))}
        </div>
      )}
      {r.badges.length > 0 && (
        <div className="badges" aria-label={tr('선반 위 기념품', 'Keepsakes on the shelf')}>
          {r.badges.map((b) => <span className="badge" key={b.code + b.label}>{b.label}</span>)}
        </div>
      )}

      <Link className="btn primary block" to={`/play/${r.owner.handle}`}>
        {isMe ? tr('내 방에서 놀기', 'Play in my room') : tr(`${r.parrots[0]?.name ?? r.owner.nickname}네 놀러가기`, `Visit ${r.parrots[0]?.name ?? r.owner.nickname}`)}
      </Link>
      {!isMe && (
        <button className="btn leaf block" onClick={leaveFeather} disabled={r.relation.featherLeftToday}>
          <FeatherIcon /> {r.relation.featherLeftToday ? tr('오늘은 깃털을 남겼어요', 'Feather left today') : tr('깃털만 남기고 가기', 'Just leave a feather')}
        </button>
      )}
      {isMe && r.stats.postCount === 0 && (
        <div className="empty">
          {tr('아직 방이 비어 있어요. 첫 일기를 쓰면 벽에 액자가 걸려요.', 'The room is still empty. Your first diary hangs a frame on the wall.')}
          <div style={{ marginTop: 10 }}><Link className="btn primary" to="/write">{tr('첫 일기 쓰기', 'Write the first diary')}</Link></div>
        </div>
      )}

      <h2 className="section-title">{tr('방명록', 'Guestbook')} {book.length}</h2>
      <form className="compose" onSubmit={writeNote}>
        <label htmlFor="note" hidden>{tr('방명록', 'Guestbook')}</label>
        <input id="note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={isMe ? tr('내 방에도 한마디 남길 수 있어요', 'You can leave a note in your own room too') : tr(`${r.parrots[0]?.name ?? r.owner.nickname}에게 한마디`, `Say hi to ${r.parrots[0]?.name ?? r.owner.nickname}`)} />
        <button className="btn primary">{tr('남기기', 'Post')}</button>
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
              }}>{tr('지우기', 'Delete')}</button>
            )}
          </li>
        ))}
      </ul>

      <h2 className="section-title">{tr('일기', 'Diaries')} {r.stats.postCount}</h2>
      {posts.length === 0 ? (
        <p className="lede">{tr('아직 일기가 없어요.', 'No diaries yet.')}</p>
      ) : (
        <div className="grid">
          {posts.map((p) => (
            <Link key={p.id} to={`/post/${p.id}`} aria-label={p.body ? p.body.slice(0, 30) : tr('사진 일기', 'Photo diary')}>
              {p.images[0] ? <img src={p.images[0].url} alt="" loading="lazy" /> : <span className="text-tile">{p.body}</span>}
            </Link>
          ))}
        </div>
      )}
      {postCursor != null && <button className="btn" onClick={morePosts}>{tr('일기 더 보기', 'More diaries')}</button>}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
