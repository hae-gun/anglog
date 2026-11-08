import { lazy, ReactNode, Suspense } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { isMock } from './api';
import { HomeIcon, PlusIcon, RoomIcon, VisitIcon } from './components/Icons';
import { FeedPage } from './pages/Feed';
import { LoginPage } from './pages/Login';
import { ParrotEditPage, ParrotNewPage } from './pages/ParrotEdit';
import { PostDetailPage } from './pages/PostDetail';
import { WritePage } from './pages/Write';
import { useSession } from './session';

// The 3D room pulls in three.js, so it loads only when someone opens a room.
const RoomPage = lazy(() => import('./pages/Room').then((m) => ({ default: m.RoomPage })));
const VisitPage = lazy(() => import('./pages/Visit').then((m) => ({ default: m.VisitPage })));
const PlayPage = lazy(() => import('./pages/Play').then((m) => ({ default: m.PlayPage })));

function RequireLogin({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  if (loading) return <div className="center">불러오는 중</div>;
  return me ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  const { me, loading } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="logo"><img src="/icon.svg" alt="" />짹로그</Link>
        <div className="row" style={{ alignItems: 'center' }}>
          {isMock && <span className="mock-badge">가짜 서버</span>}
          {!loading && !me && <Link className="btn small" to="/login">로그인</Link>}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<FeedPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/write" element={<RequireLogin><WritePage /></RequireLogin>} />
          <Route path="/post/:id" element={<PostDetailPage />} />
          <Route path="/visit" element={<Suspense fallback={<div className="center">공원 가는 중</div>}><VisitPage /></Suspense>} />
          <Route path="/play/:handle" element={<Suspense fallback={<div className="center">방에 들어가는 중</div>}><PlayPage /></Suspense>} />
          <Route path="/room/:handle" element={<Suspense fallback={<div className="center">방에 들어가는 중</div>}><RoomPage /></Suspense>} />
          <Route path="/parrots/new" element={<RequireLogin><ParrotNewPage /></RequireLogin>} />
          <Route path="/parrots/:id/edit" element={<RequireLogin><ParrotEditPage /></RequireLogin>} />
          <Route path="*" element={<div className="page"><p className="empty">없는 페이지예요.</p></div>} />
        </Routes>
      </main>

      <nav className="bottomnav" aria-label="주 메뉴">
        <div className="bottomnav-inner">
          <NavLink to="/" end className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}><HomeIcon />홈</NavLink>
          <NavLink to="/visit" className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}><VisitIcon />놀러가기</NavLink>
          <NavLink to="/write" className={({ isActive }) => `navlink write${isActive ? ' active' : ''}`} aria-label="일기 쓰기">
            <span className="plus"><PlusIcon /></span>
          </NavLink>
          <NavLink to={me ? `/room/${me.handle}` : '/login'} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}><RoomIcon />내 방</NavLink>
        </div>
      </nav>
    </div>
  );
}
