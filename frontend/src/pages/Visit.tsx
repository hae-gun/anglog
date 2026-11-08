import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, RoomCard } from '../api';
import { BirdAvatar } from '../components/BirdAvatar';
import { ParrotForm } from '../components/ParrotForm';
import { GuestBird, loadGuestBird, saveGuestBird } from '../lib/guestBird';
import { timeAgo } from '../lib/image';
import { isMuted, setMuted } from '../lib/sound';
import { mountPark } from '../room3d/park.js';
import { useSession } from '../session';

interface Controller {
  chirp(): void;
  playTogether(): string | null;
  enter(handle: string): boolean;
  dispose(): void;
}
type ParkCard = RoomCard & { mine?: boolean };

const PARK_HOUSES = 12;

/** 놀러가기: the park. Everyone's birdhouse stands here; walk in through the round door to play in that room. */
export function VisitPage() {
  const { me, parrots, loading } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const startAt = useRef(params.get('at'));
  const stage = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const [rooms, setRooms] = useState<RoomCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState<GuestBird>(loadGuestBird);
  const [sheet, setSheet] = useState<null | 'list' | 'dress'>(null);
  const [bird, setBird] = useState<{ handle: string; nickname: string; birdName: string } | null>(null);
  const [hint, setHint] = useState(true);
  const [muted, setMute] = useState(isMuted());
  const [toast, setToast] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const myBird = parrots[0] ?? null;
  const visitor = myBird ?? guest;

  useEffect(() => {
    let alive = true;
    api.exploreRooms()
      .then((r) => alive && setRooms(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : '공원을 불러오지 못했어요.'));
    return () => { alive = false; };
  }, [me?.id]);

  // My house stands at the front when I have a bird; the neighbours fill the rest.
  const houses = useMemo<ParkCard[]>(() => {
    if (!rooms) return [];
    const mine: ParkCard[] = me && parrots.length
      ? [{ owner: me, parrots, coverImageUrl: null, latestPostAt: null, postedToday: false, following: false, featherLeftToday: false, mine: true }]
      : [];
    return [...mine, ...rooms].slice(0, PARK_HOUSES);
  }, [rooms, me, parrots]);

  useEffect(() => {
    if (!rooms || loading || !stage.current) return;
    try {
      ctl.current = mountPark(stage.current, houses, {
        visitor: { name: visitor.name, colors: visitor.colors, species: visitor.species },
        startAt: startAt.current,
        onEnter: (handle: string) => navigate(`/play/${handle}`),
        onBirdTap: (who: { handle: string; nickname: string; birdName: string }) => setBird(who),
        onEmptyLot: () => setToast(
          me && parrots.length ? '새 이웃을 기다리는 빈 터예요.'
            : me ? '내 앵무를 등록하면 공원에 내 집이 생겨요.'
              : '로그인하고 앵무를 등록하면 여기에 내 집이 생겨요.'),
      }) as Controller;
    } catch {
      setBroken(true);
    }
    // coming back from a house happens once; later remounts start at the entrance
    startAt.current = null;
    if (params.has('at')) setParams({}, { replace: true });
    setHint(true);
    const t = setTimeout(() => setHint(false), 7000);
    return () => {
      clearTimeout(t);
      ctl.current?.dispose();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houses, loading, visitor.name, visitor.colors.body, visitor.colors.head, visitor.species]);

  useEffect(() => {
    if (!bird) return;
    const t = setTimeout(() => setBird(null), 6000);
    return () => clearTimeout(t);
  }, [bird]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  async function surf() {
    const next = await api.randomRoom(null);
    if (!next) return setToast('아직 놀러갈 집이 없어요.');
    if (!ctl.current?.enter(next)) navigate(`/play/${next}`);
  }

  const followed = rooms?.filter((r) => r.following) ?? [];
  const others = rooms?.filter((r) => !r.following) ?? [];

  return (
    <div className="play">
      <div className="play-stage park-stage" ref={stage} aria-label="짹로그 공원. 바닥을 누르면 내 앵무가 걸어가고, 집 문을 누르면 그 집에 들어가요. 끌면 공원을 둘러봐요.">
        <div className="play-top">
          <button className="play-chip" onClick={() => setSheet('list')}>집 목록</button>
          <div className="row" style={{ gap: 6 }}>
            <button className="play-chip" onClick={() => { setMuted(!muted); setMute(!muted); }} aria-pressed={!muted}>
              {muted ? '소리 꺼짐' : '소리 켜짐'}
            </button>
            <button className="play-chip strong" onClick={surf}>아무 집이나</button>
          </div>
        </div>
        {!rooms && !error && <p className="play-hint">공원 문 여는 중</p>}
        {error && <p className="play-note" role="alert">{error}</p>}
        {broken && <p className="play-note">이 기기에서는 3D 공원을 열 수 없어요. 집 목록으로 놀러가 주세요.</p>}
        {rooms && hint && !broken && !bird && (
          <p className="play-hint">바닥을 누르면 걸어가고, 집 문을 누르면 들어가요. 화면을 끌면 공원을 둘러볼 수 있어요.</p>
        )}
        {bird && (
          <div className="park-pop" role="status">
            <div>
              <b>{bird.birdName}</b>
              <span>{bird.nickname}의 집에 살아요</span>
            </div>
            <button className="btn small primary" onClick={() => { const h = bird.handle; setBird(null); if (!ctl.current?.enter(h)) navigate(`/play/${h}`); }}>놀러가기</button>
            <Link className="btn small" to={`/room/${bird.handle}`}>일기</Link>
          </div>
        )}
        {rooms && !myBird && !broken && hint && (
          <p className="play-note">
            {me
              ? <>지금은 {guest.name}로 놀고 있어요. <Link to="/parrots/new">내 앵무를 등록</Link>하면 공원에 내 집이 생겨요.</>
              : <>로그인 없이 {guest.name}로 놀고 있어요. <Link to="/login">로그인</Link>하면 깃털과 방명록도 남길 수 있어요.</>}
          </p>
        )}
      </div>

      <div className="play-actions park-actions" role="group" aria-label="공원에서 놀기">
        <button className="btn" onClick={() => ctl.current?.chirp()}>짹짹</button>
        <button className="btn leaf" onClick={() => { if (ctl.current?.playTogether() === null) setToast('공원에 아직 다른 앵무가 없어요.'); }}>같이 놀기</button>
        {myBird && me
          ? <button className="btn primary" onClick={() => { if (!ctl.current?.enter(me.handle)) navigate(`/play/${me.handle}`); }}>내 집으로</button>
          : <button className="btn primary" onClick={() => setSheet('dress')}>앵무 꾸미기</button>}
      </div>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            aria-label={sheet === 'list' ? '집 목록' : '앵무 꾸미기'}>
            <button className="sheet-close btn ghost small" onClick={() => setSheet(null)}>닫기</button>

            {sheet === 'dress' && (
              <>
                <h2 className="section-title">공원에서 쓸 내 앵무</h2>
                <p className="lede">로그인 없이도 이 모습으로 공원과 집에 놀러가요. 이 기기에만 저장돼요.</p>
                <ParrotForm compact submitLabel="이 모습으로 놀기"
                  initial={{ name: guest.name === '손님' ? '' : guest.name, species: guest.species, colors: guest.colors, birthDate: null, adoptedDate: null }}
                  onSubmit={async (v) => {
                    const next = { name: v.name, species: v.species, colors: v.colors };
                    saveGuestBird(next);
                    setGuest(next);
                    setSheet(null);
                  }} />
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
                <h2 className="section-title">{followed.length ? '이웃집' : '공원의 집들'}</h2>
                {others.length > 0
                  ? <div className="room-cards">{others.map((r) => <Card key={r.owner.id} r={r} />)}</div>
                  : <p className="lede">아직 이웃이 없어요. 친구에게 짹로그를 알려 주세요.</p>}
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
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
