import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, Comment, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { timeAgo } from '../lib/image';
import { useSession } from '../session';

export function PostDetailPage() {
  const { id } = useParams();
  const postId = Number(id);
  const { me } = useSession();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.post(postId), api.comments(postId)])
      .then(([p, c]) => {
        if (!alive) return;
        setPost(p);
        setComments(c.items);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : '불러오지 못했어요.'));
    return () => { alive = false; };
  }, [postId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!me) {
      navigate('/login');
      return;
    }
    if (!text.trim()) return;
    setBusy(true);
    try {
      const c = await api.addComment(postId, text);
      setComments((prev) => [...prev, c]);
      setPost((p) => (p ? { ...p, commentCount: p.commentCount + 1 } : p));
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '댓글을 남기지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function removePost() {
    if (!post) return;
    try {
      await api.deletePost(post.id);
      navigate(`/room/${post.author.handle}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '지우지 못했어요.');
    }
  }

  if (error && !post) return <div className="page"><p className="error">{error}</p></div>;
  if (!post) return <div className="center">불러오는 중</div>;

  const mine = me?.id === post.author.id;
  return (
    <div className="page">
      <PostCard key={post.id + ':' + post.commentCount} post={post} linkToDetail={false} />
      {mine && <DeleteButton onConfirm={removePost} />}

      <h2 className="section-title">댓글 {comments.length}</h2>
      {comments.length === 0 && <p className="lede">첫 댓글을 남겨 주세요.</p>}
      <ul className="list">
        {comments.map((c) => (
          <li className="list-item" key={c.id}>
            <div className="content">
              <Link className="name" to={`/room/${c.author.handle}`}>{c.author.nickname}</Link>
              <span className="time">{timeAgo(c.createdAt)}</span>
              <p>{c.body}</p>
            </div>
            {(c.mine || mine) && (
              <button className="btn ghost small" onClick={async () => {
                await api.deleteComment(c.id);
                setComments((prev) => prev.filter((x) => x.id !== c.id));
              }}>지우기</button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="compose" onSubmit={send}>
        <label htmlFor="comment" hidden>댓글</label>
        <input id="comment" className="input" maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={me ? '따뜻한 한마디' : '로그인하면 댓글을 남길 수 있어요'} />
        <button className="btn primary" disabled={busy}>남기기</button>
      </form>
    </div>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className="btn ghost small" style={{ alignSelf: 'flex-end' }} onClick={() => setAsking(true)}>일기 지우기</button>;
  return (
    <div className="row" style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      <span className="lede">정말 지울까요? 되돌릴 수 없어요.</span>
      <button className="btn small" onClick={() => setAsking(false)}>그대로 두기</button>
      <button className="btn small primary" onClick={onConfirm}>지우기</button>
    </div>
  );
}
