import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, FeedTab, Post } from '../api';
import { PostCard } from '../components/PostCard';
import { useSession } from '../session';

export function FeedPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<FeedTab>(me ? 'following' : 'latest');
  const [items, setItems] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await api.feed(tab, reset ? null : cursor);
      if (id !== reqId.current) return;
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
      setDone(page.nextCursor == null);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : '불러오지 못했어요.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [tab, cursor]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setDone(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loading && !done && items.length) void load(false);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [load, loading, done, items.length]);

  return (
    <div className="page">
      {me && (
        <div className="tabs" role="tablist" aria-label="피드 종류">
          <button className="tab" role="tab" aria-selected={tab === 'following'} onClick={() => setTab('following')}>팔로잉</button>
          <button className="tab" role="tab" aria-selected={tab === 'latest'} onClick={() => setTab('latest')}>최신</button>
        </div>
      )}
      {!me && (
        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ font: '18px/1.3 var(--display)' }}>우리 앵무 일기도 써 볼까요?</strong>
          <span className="lede">기록할수록 내 앵무가 사는 3D 방이 채워져요.</span>
          <Link className="btn primary" to="/login">시작하기</Link>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {items.map((p) => <PostCard key={p.id} post={p} />)}
      {!loading && !error && items.length === 0 && (
        <div className="empty">
          {tab === 'following' ? '아직 팔로우한 방이 없어요. 최신 탭에서 다른 집 앵무를 구경해 보세요.' : '아직 일기가 없어요. 첫 일기를 남겨 주세요.'}
        </div>
      )}
      {loading && <p className="lede" style={{ textAlign: 'center' }}>불러오는 중</p>}
      <div ref={sentinel} />
    </div>
  );
}
