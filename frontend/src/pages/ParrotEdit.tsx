import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ParrotForm } from '../components/ParrotForm';
import { DEFAULT_GUEST, loadGuestBird } from '../lib/guestBird';
import { useSession } from '../session';

export function ParrotNewPage() {
  const { me, parrots, refresh } = useSession();
  const navigate = useNavigate();
  const first = parrots.length === 0;
  // the bird dressed up in 앵파크 comes along as a starting point
  const guest = loadGuestBird();
  const fromPark = first && guest !== DEFAULT_GUEST;
  return (
    <div className="page">
      <h1 className="page-title">{first ? '먼저 우리 앵무를 소개해 주세요' : '앵무 추가'}</h1>
      {first && <p className="lede">일기마다 어느 앵무 이야기인지 고를 수 있고, 내 방과 앵파크 집에도 이 앵무가 살게 돼요.{fromPark && ' 앵파크에서 꾸민 모습을 가져왔어요.'}</p>}
      <ParrotForm
        initial={fromPark ? { name: guest.name === DEFAULT_GUEST.name ? '' : guest.name, species: guest.species, colors: guest.colors, birthDate: null, adoptedDate: null } : undefined}
        submitLabel="등록하기"
        onSubmit={async (v) => {
          await api.createParrot(v);
          await refresh();
          navigate(first ? '/write' : `/room/${me?.handle}`, { replace: true });
        }}
      />
    </div>
  );
}

export function ParrotEditPage() {
  const { id } = useParams();
  const { me, parrots, refresh } = useSession();
  const navigate = useNavigate();
  const parrot = parrots.find((p) => p.id === Number(id));
  if (!parrot) return <div className="page"><p className="empty">앵무를 찾을 수 없어요.</p></div>;
  return (
    <div className="page">
      <h1 className="page-title">{parrot.name} 정보 고치기</h1>
      <ParrotForm
        initial={{ name: parrot.name, species: parrot.species, birthDate: parrot.birthDate, adoptedDate: parrot.adoptedDate, colors: parrot.colors }}
        submitLabel="저장하기"
        onSubmit={async (v) => {
          await api.updateParrot(parrot.id, v);
          await refresh();
          navigate(`/room/${me?.handle}`, { replace: true });
        }}
      />
    </div>
  );
}
