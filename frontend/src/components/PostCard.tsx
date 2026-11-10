import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, moodName, Post, speciesName } from '../api';
import { timeAgo } from '../lib/image';
import { useSession } from '../session';
import { BirdAvatar } from './BirdAvatar';
import { CommentIcon, HeartIcon } from './Icons';
import { tr } from '../i18n';

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
        <Link to={`/room/${p.author.handle}`} className="avatar" aria-label={tr(`${p.author.nickname}의 방`, `${p.author.nickname}'s room`)}>
          <BirdAvatar colors={p.parrot?.colors} species={p.parrot?.species} />
        </Link>
        <div className="who">
          <Link to={`/room/${p.author.handle}`}>{p.parrot ? `${p.parrot.name}` : p.author.nickname}</Link>
          <span className="meta">
            {p.author.nickname}
            {p.parrot ? `, ${speciesName(p.parrot.species)}` : ''}
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
              <img key={i} src={img.url} width={img.width} height={img.height} alt={tr(`${p.parrot?.name ?? '앵무'} 사진 ${i + 1}`, `${p.parrot?.name ?? 'Parrot'} photo ${i + 1}`)} loading="lazy" />
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
        {(p.weightG != null || p.mood) && (
          <div className="records">
            {p.weightG != null && <span className="record">{tr('체중', 'Weight')} <b>{Number(p.weightG)}g</b></span>}
            {p.mood && <span className="record mood">{tr('기분', 'Mood')} <b>{moodName(p.mood)}</b></span>}
          </div>
        )}
        {p.body && <p className="post-text">{p.body}</p>}
      </div>

      <div className="actions">
        <button className={`icon-btn${p.likedByMe ? ' liked' : ''}`} onClick={toggleLike} aria-pressed={p.likedByMe} aria-label={tr('좋아요', 'Like')}>
          <HeartIcon /> {p.likeCount}
        </button>
        {linkToDetail ? (
          <Link className="icon-btn" to={`/post/${p.id}`} aria-label={tr('댓글 보기', 'Comments')}>
            <CommentIcon /> {p.commentCount}
          </Link>
        ) : (
          <span className="icon-btn"><CommentIcon /> {p.commentCount}</span>
        )}
      </div>
    </article>
  );
}
