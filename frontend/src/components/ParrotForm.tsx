import { FormEvent, useEffect, useRef, useState } from 'react';
import { ParrotColors, ParrotInput, Species, SPECIES } from '../api';
import { analyzePhoto, partsFor, PhotoAnalysis } from '../lib/photoColors';
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

const speciesLabel = (s: Species) => SPECIES.find((x) => x.value === s)?.label ?? '기타';

interface PhotoState {
  url: string;
  analysis: PhotoAnalysis;
  /** what the form had before the photo, for the undo button */
  before: { species: Species; colors: ParrotColors };
}

/**
 * Picks colors (and a species guess) from a parrot photo: choose a file, paste one, or drop one.
 * The photo is read on this device only and is not uploaded or kept.
 */
function PhotoPicker({ photo, busy, error, onFile, onUndo }: {
  photo: PhotoState | null; busy: boolean; error: string | null; onFile: (f: File) => void; onUndo: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const a = photo?.analysis;
  let verdict = '';
  if (a) {
    if (!a.species) verdict = '종은 잘 모르겠어요. 아래에서 골라 주세요. 색은 사진에서 가져왔어요.';
    else if (a.confident) verdict = `${speciesLabel(a.species)} 같아요. 색도 사진에서 가져왔어요.`;
    else {
      const alt = a.ranking[1] && a.ranking[1].score >= 0.15 ? `, ${speciesLabel(a.ranking[1].species)}일 수도 있어요` : '';
      verdict = `아마 ${speciesLabel(a.species)}${alt}. 다르면 아래에서 종을 바꿔 주세요.`;
    }
  }
  return (
    <div className={`photo-pick${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
        if (f) onFile(f);
      }}>
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      {photo && <img src={photo.url} alt="올린 앵무 사진" className="photo-thumb" />}
      <div className="photo-body">
        {!photo && !busy && <p className="photo-title">사진으로 색 찾기</p>}
        {busy && <p className="photo-title" role="status">사진 보는 중</p>}
        {photo && !busy && a && (
          <>
            <p className="photo-title" role="status">{verdict}</p>
            {a.caution && <p className="hint">{a.caution}</p>}
            <div className="photo-palette" aria-label="사진에서 찾은 색">
              {a.clusters.slice(0, 6).map((c) => <span key={c.hex + c.share} style={{ background: c.hex, flexGrow: Math.max(0.4, c.share * 10) }} title={c.hex} />)}
            </div>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row">
          <button type="button" className="btn small primary" disabled={busy} onClick={() => input.current?.click()}>
            {photo ? '다른 사진' : '사진 고르기'}
          </button>
          {photo && <button type="button" className="btn small" onClick={onUndo}>되돌리기</button>}
        </div>
        {!photo && <span className="hint">사진을 붙여넣거나 여기에 끌어다 놓아도 돼요. 사진은 이 기기에서만 보고 어디에도 올리지 않아요.</span>}
      </div>
    </div>
  );
}

/** compact: name, species and colors only (the guest bird in the park). */
export function ParrotForm({ initial, submitLabel, onSubmit, compact = false }: { initial?: ParrotInput; submitLabel: string; onSubmit: (v: ParrotInput) => Promise<void>; compact?: boolean }) {
  const [v, setV] = useState<ParrotInput>(
    initial ?? { name: '', species: 'LOVEBIRD', birthDate: null, adoptedDate: null, colors: SPECIES_COLORS.LOVEBIRD },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const latest = useRef(v);
  latest.current = v;

  async function readPhoto(file: File) {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const analysis = await analyzePhoto(file);
      const cur = latest.current;
      const species = analysis.species ?? cur.species;
      setV({ ...cur, species, colors: partsFor(analysis, species, SPECIES_COLORS[species]) });
      // the old preview address is released by the effect below
      setPhoto((old) => ({ url: URL.createObjectURL(file), analysis, before: old ? old.before : { species: cur.species, colors: cur.colors } }));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : '사진을 읽지 못했어요.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function undoPhoto() {
    if (!photo) return;
    setV({ ...latest.current, ...photo.before });
    setPhoto(null);
  }

  // a pasted image anywhere on the page goes to the photo picker; pasted text stays where it was
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault();
      readPhoto(f);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // readPhoto only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
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

      <PhotoPicker photo={photo} busy={photoBusy} error={photoError} onFile={readPhoto} onUndo={undoPhoto} />

      <div className="field">
        <span className="label" id="species-label">종</span>
        <div className="chips" role="group" aria-labelledby="species-label">
          {SPECIES.map((s) => (
            <button type="button" key={s.value} className="chip" aria-pressed={v.species === s.value}
              onClick={() => setV({
                ...v, species: s.value,
                // with a photo, the same photo colors move to where this species wears them
                colors: photo ? partsFor(photo.analysis, s.value, SPECIES_COLORS[s.value]) : initial ? v.colors : SPECIES_COLORS[s.value],
              })}>
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
        <span className="hint">{compact ? '앵파크와 방에서 이 모습으로 돌아다녀요.' : '방 안의 3D 앵무도 이 색으로 보여요.'}</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy}>{busy ? '저장하는 중' : submitLabel}</button>
    </form>
  );
}
