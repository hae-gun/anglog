import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ParrotForm } from '../components/ParrotForm';
import { useSession } from '../session';

export function ParrotNewPage() {
  const { me, parrots, refresh } = useSession();
  const navigate = useNavigate();
  const first = parrots.length === 0;
  return (
    <div className="page">
      <h1 className="page-title">{first ? '먼저 우리 앵무를 소개해 주세요' : '앵무 추가'}</h1>
      {first && <p className="lede">일기마다 어느 앵무 이야기인지 고를 수 있고, 내 방에도 이 앵무가 살게 돼요.</p>}
      <ParrotForm
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
