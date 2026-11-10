import { lazy, ReactNode, Suspense } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { isMock } from './api';
import { HomeIcon, PlusIcon, RoomIcon, VisitIcon } from './components/Icons';
import { FeedPage } from './pages/Feed';
import { LoginPage } from './pages/Login';
import { ParrotEditPage, ParrotNewPage } from './pages/ParrotEdit';
import { PostDetailPage } from './pages/PostDetail';
import { WritePage } from './pages/Write';
import { useSession } from './session';
import { LangSwitch } from './components/LangSwitch';
import { tr } from './i18n';

// The 3D room pulls in three.js, so it loads only when someone opens a room.
const RoomPage = lazy(() => import('./pages/Room').then((m) => ({ default: m.RoomPage })));
const ParkPage = lazy(() => import('./pages/Park').then((m) => ({ default: m.ParkPage })));
const PlayPage = lazy(() => import('./pages/Play').then((m) => ({ default: m.PlayPage })));
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));

function RequireLogin({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  if (loading) return <div className="center">{tr('불러오는 중', 'Loading')}</div>;
  return me ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Old links to /visit go to the park, keeping ?at=. */
function VisitRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/park${search}`} replace />;
}

export function App() {
  const { me, loading } = useSession();
  const { pathname } = useLocation();
  // 앵파크 is a full-screen game: no header or bottom menu
  if (pathname.startsWith('/park')) {
    return (
      <div className="app game">
        <Suspense fallback={<div className="center">{tr('앵파크 가는 중', 'Heading to the park')}</div>}><ParkPage /></Suspense>
      </div>
    );
  }
  return (
    <div className={pathname.startsWith('/admin') ? 'app wide' : 'app'}>
      <header className="topbar">
        <Link to="/feed" className="logo"><img src="/icon.svg" alt="" />{tr('앵로그', 'Anglog')}</Link>
        <div className="row" style={{ alignItems: 'center' }}>
          <LangSwitch />
          {isMock && <span className="mock-badge">{tr('가짜 서버', 'Mock')}</span>}
          {me?.admin && <Link className="btn small" to="/admin">{tr('관리', 'Admin')}</Link>}
          {!loading && !me && <Link className="btn small" to="/login">{tr('로그인', 'Log in')}</Link>}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/park" replace />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/write" element={<RequireLogin><WritePage /></RequireLogin>} />
          <Route path="/post/:id" element={<PostDetailPage />} />
          <Route path="/visit" element={<VisitRedirect />} />
          <Route path="/play/:handle" element={<Suspense fallback={<div className="center">{tr('방에 들어가는 중', 'Entering the room')}</div>}><PlayPage /></Suspense>} />
          <Route path="/room/:handle" element={<Suspense fallback={<div className="center">{tr('방에 들어가는 중', 'Entering the room')}</div>}><RoomPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<div className="center">{tr('불러오는 중', 'Loading')}</div>}><AdminPage /></Suspense>} />
          <Route path="/parrots/new" element={<RequireLogin><ParrotNewPage /></RequireLogin>} />
          <Route path="/parrots/:id/edit" element={<RequireLogin><ParrotEditPage /></RequireLogin>} />
          <Route path="*" element={<div className="page"><p className="empty">{tr('없는 페이지예요.', 'This page does not exist.')}</p></div>} />
        </Routes>
      </main>

      <nav className="bottomnav" aria-label={tr('주 메뉴', 'Main menu')}>
        <div className="bottomnav-inner">
          <NavLink to="/feed" end className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}><HomeIcon />{tr('홈', 'Home')}</NavLink>
          <NavLink to="/park" className="navlink"><VisitIcon />{tr('앵파크', 'Park')}</NavLink>
          <NavLink to="/write" className={({ isActive }) => `navlink write${isActive ? ' active' : ''}`} aria-label={tr('일기 쓰기', 'Write a diary')}>
            <span className="plus"><PlusIcon /></span>
          </NavLink>
          <NavLink to={me ? `/room/${me.handle}` : '/login'} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}><RoomIcon />{tr('내 방', 'My room')}</NavLink>
        </div>
      </nav>
    </div>
  );
}
