import { FormEvent, useState } from 'react';
import { ParrotColors, ParrotInput, Species, SPECIES } from '../api';
import { BirdAvatar } from './BirdAvatar';

/** Typical colors per species, used as a starting point when the species is picked. */
const SPECIES_COLORS: Record<Species, ParrotColors> = {
  LOVEBIRD: { face: '#F2784B', head: '#E0473A', body: '#5DBB4A', wing: '#4A9A3B', tail: '#4A9A3B' },
  BUDGIE: { face: '#F5E06A', head: '#F2D64A', body: '#6CC24A', wing: '#3E5E2E', tail: '#2E5E8E' },
  COCKATIEL: { face: '#F5E06A', head: '#F2D64A', body: '#B9B6B0', wing: '#8F8C87', tail: '#8F8C87' },
  QUAKER: { face: '#C9CFC4', head: '#B8C0B4', body: '#7DBB5A', wing: '#5E9A44', tail: '#5E9A44' },
  GREEN_CHEEKED_CONURE: { face: '#5DA84A', head: '#4A4038', body: '#5DA84A', wing: '#3E7E34', tail: '#A0302A' },
  OTHER: { face: '#F3EDE0', head: '#F3EDE0', body: '#7FB7D8', wing: '#6597BC', tail: '#6597BC' },
};

const PARTS: { key: keyof ParrotColors; label: string }[] = [
  { key: 'face', label: '얼굴' },
  { key: 'head', label: '머리' },
  { key: 'body', label: '몸' },
  { key: 'wing', label: '날개' },
  { key: 'tail', label: '꼬리' },
];

function randomColors(): ParrotColors {
  const hsl = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const r = Math.random;
  const base = r();
  return {
    face: hsl((base + 0.05 + r() * 0.15) % 1, 0.55 + r() * 0.3, 0.6 + r() * 0.15),
    head: hsl((base + r() * 0.12) % 1, 0.6 + r() * 0.3, 0.5 + r() * 0.15),
    body: hsl(base, 0.45 + r() * 0.35, 0.5 + r() * 0.15),
    wing: hsl((base + (r() - 0.5) * 0.12 + 1) % 1, 0.45 + r() * 0.3, 0.4 + r() * 0.12),
    tail: hsl((base + (r() - 0.5) * 0.25 + 1) % 1, 0.45 + r() * 0.3, 0.42 + r() * 0.15),
  };
}

/** compact: name, species and colors only (the guest bird in the park). */
export function ParrotForm({ initial, submitLabel, onSubmit, compact = false }: { initial?: ParrotInput; submitLabel: string; onSubmit: (v: ParrotInput) => Promise<void>; compact?: boolean }) {
  const [v, setV] = useState<ParrotInput>(
    initial ?? { name: '', species: 'LOVEBIRD', birthDate: null, adoptedDate: null, colors: SPECIES_COLORS.LOVEBIRD },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) {
      setError('이름을 적어 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...v, name: v.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="page" style={{ padding: 0 }}>
      <div className="preview-bird"><BirdAvatar colors={v.colors} species={v.species} title={`${v.name || '내 앵무'} 미리보기`} /></div>

      <div className="field">
        <label htmlFor="pname">이름</label>
        <input id="pname" className="input" maxLength={20} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="머란이" />
      </div>

      <div className="field">
        <span className="label" id="species-label">종</span>
        <div className="chips" role="group" aria-labelledby="species-label">
          {SPECIES.map((s) => (
            <button type="button" key={s.value} className="chip" aria-pressed={v.species === s.value}
              onClick={() => setV({ ...v, species: s.value, colors: initial ? v.colors : SPECIES_COLORS[s.value] })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!compact && <div className="row">
        <div className="field">
          <label htmlFor="adopted">입양일</label>
          <input id="adopted" type="date" className="input" max={today} value={v.adoptedDate ?? ''} onChange={(e) => setV({ ...v, adoptedDate: e.target.value || null })} />
        </div>
        <div className="field">
          <label htmlFor="birth">생일 (알면)</label>
          <input id="birth" type="date" className="input" max={today} value={v.birthDate ?? ''} onChange={(e) => setV({ ...v, birthDate: e.target.value || null })} />
        </div>
      </div>}

      <div className="field">
        <span className="label">색</span>
        <div className="swatches">
          {PARTS.map((part) => (
            <label className="sw" key={part.key}>
              <input type="color" value={v.colors[part.key]} onChange={(e) => setV({ ...v, colors: { ...v.colors, [part.key]: e.target.value } })} />
              {part.label}
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button type="button" className="btn small" onClick={() => setV({ ...v, colors: SPECIES_COLORS[v.species] })}>종 기본색</button>
          <button type="button" className="btn small primary" onClick={() => setV({ ...v, colors: randomColors() })}>랜덤 색</button>
        </div>
        <span className="hint">{compact ? '공원과 방에서 이 모습으로 돌아다녀요.' : '방 안의 3D 앵무도 이 색으로 보여요.'}</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? '저장하는 중' : submitLabel}</button>
    </form>
  );
}
