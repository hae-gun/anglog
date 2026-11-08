import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, Post } from '../api';
import { timeAgo } from '../lib/image';
import { useSession } from '../session';
import { BirdAvatar } from './BirdAvatar';
import { CommentIcon, HeartIcon } from './Icons';

export function PostCard({ post, onChange, linkToDetail = true }: { post: Post; onChange?: (p: Post) => void; linkToDetail?: boolean }) {
  const { me } = useSession();
  const navigate = useNavigate();
  const [p, setP] = useState(post);
  const [slide, setSlide] = useState(0);

  async function toggleLike() {
    if (!me) {
      navigate('/login');
      return;
    }
    const on = !p.likedByMe;
    const optimistic = { ...p, likedByMe: on, likeCount: p.likeCount + (on ? 1 : -1) };
    setP(optimistic);
    try {
      const r = await api.like(p.id, on);
      const next = { ...optimistic, likedByMe: r.liked, likeCount: r.likeCount };
      setP(next);
      onChange?.(next);
    } catch (e) {
      setP(p);
      if (e instanceof ApiError && e.status === 401) navigate('/login');
    }
  }

  const when = timeAgo(p.createdAt);
  return (
    <article className="card">
      <header className="post-head">
        <Link to={`/room/${p.author.handle}`} className="avatar" aria-label={`${p.author.nickname}의 방`}>
          <BirdAvatar colors={p.parrot?.colors} species={p.parrot?.species} />
        </Link>
        <div className="who">
          <Link to={`/room/${p.author.handle}`}>{p.parrot ? `${p.parrot.name}` : p.author.nickname}</Link>
          <span className="meta">
            {p.author.nickname}
            {p.parrot ? `, ${p.parrot.speciesLabel}` : ''}
            <span style={{ marginLeft: 8 }}>{when}</span>
          </span>
        </div>
      </header>

      {p.images.length > 0 && (
        <div className="carousel">
          <div
            className="carousel-track"
            onScroll={(e) => {
              const el = e.currentTarget;
              setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
            }}
          >
            {p.images.map((img, i) => (
              <img key={i} src={img.url} width={img.width} height={img.height} alt={`${p.parrot?.name ?? '앵무'} 사진 ${i + 1}`} loading="lazy" />
            ))}
          </div>
          {p.images.length > 1 && (
            <div className="carousel-dots">
              {p.images.map((_, i) => <span key={i} className={i === slide ? 'on' : ''} />)}
            </div>
          )}
        </div>
      )}

      <div className="post-body">
        {(p.weightG != null || p.moodLabel) && (
          <div className="records">
            {p.weightG != null && <span className="record">체중 <b>{Number(p.weightG)}g</b></span>}
            {p.moodLabel && <span className="record mood">기분 <b>{p.moodLabel}</b></span>}
          </div>
        )}
        {p.body && <p className="post-text">{p.body}</p>}
      </div>

      <div className="actions">
        <button className={`icon-btn${p.likedByMe ? ' liked' : ''}`} onClick={toggleLike} aria-pressed={p.likedByMe} aria-label="좋아요">
          <HeartIcon /> {p.likeCount}
        </button>
        {linkToDetail ? (
          <Link className="icon-btn" to={`/post/${p.id}`} aria-label="댓글 보기">
            <CommentIcon /> {p.commentCount}
          </Link>
        ) : (
          <span className="icon-btn"><CommentIcon /> {p.commentCount}</span>
        )}
      </div>
    </article>
  );
}
