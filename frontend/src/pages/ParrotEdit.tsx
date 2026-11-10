import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ParrotForm } from '../components/ParrotForm';
import { DEFAULT_GUEST, loadGuestBird } from '../lib/guestBird';
import { useSession } from '../session';
import { tr } from '../i18n';

export function ParrotNewPage() {
  const { me, parrots, refresh } = useSession();
  const navigate = useNavigate();
  const first = parrots.length === 0;
  // the bird dressed up in 앵파크 comes along as a starting point
  const guest = loadGuestBird();
  const fromPark = first && guest !== DEFAULT_GUEST;
  return (
    <div className="page">
      <h1 className="page-title">{first ? tr('먼저 우리 앵무를 소개해 주세요', 'First, introduce your parrot') : tr('앵무 추가', 'Add a parrot')}</h1>
      {first && <p className="lede">{tr('일기마다 어느 앵무 이야기인지 고를 수 있고, 내 방과 앵파크 집에도 이 앵무가 살게 돼요.', 'Each diary can be about one of your birds, and this bird will live in your room and your house in Parrot Park.')}{fromPark && tr(' 앵파크에서 꾸민 모습을 가져왔어요.', ' We brought over the look you made in the park.')}</p>}
      <ParrotForm
        initial={fromPark ? { name: guest.name === DEFAULT_GUEST.name ? '' : guest.name, species: guest.species, colors: guest.colors, birthDate: null, adoptedDate: null } : undefined}
        submitLabel={tr('등록하기', 'Add')}
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
  if (!parrot) return <div className="page"><p className="empty">{tr('앵무를 찾을 수 없어요.', 'Could not find that parrot.')}</p></div>;
  return (
    <div className="page">
      <h1 className="page-title">{tr(`${parrot.name} 정보 고치기`, `Edit ${parrot.name}`)}</h1>
      <ParrotForm
        initial={{ name: parrot.name, species: parrot.species, birthDate: parrot.birthDate, adoptedDate: parrot.adoptedDate, colors: parrot.colors }}
        submitLabel={tr('저장하기', 'Save')}
        onSubmit={async (v) => {
          await api.updateParrot(parrot.id, v);
          await refresh();
          navigate(`/room/${me?.handle}`, { replace: true });
        }}
      />
    </div>
  );
}
