import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, Mood, MOODS } from '../api';
import { toUploadJpeg } from '../lib/image';
import { useSession } from '../session';
import { tr } from '../i18n';

const MAX_PHOTOS = 10;

export function WritePage() {
  const { me, parrots } = useSession();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [body, setBody] = useState('');
  const [parrotId, setParrotId] = useState<number | null>(parrots[0]?.id ?? null);
  const [weight, setWeight] = useState('');
  const [mood, setMood] = useState<Mood | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);
  useEffect(() => {
    if (parrotId == null && parrots[0]) setParrotId(parrots[0].id);
  }, [parrots, parrotId]);

  if (!me) {
    return (
      <div className="page">
        <p className="empty">{tr('일기를 쓰려면 먼저 로그인해 주세요.', 'Please log in to write a diary.')}</p>
        <Link className="btn primary" to="/login">{tr('로그인', 'Log in')}</Link>
      </div>
    );
  }
  if (parrots.length === 0) {
    return (
      <div className="page">
        <p className="empty">{tr('일기를 쓰기 전에 우리 앵무를 먼저 등록해 주세요.', 'Please add your parrot before writing a diary.')}</p>
        <Link className="btn primary" to="/parrots/new">{tr('앵무 등록', 'Add a parrot')}</Link>
      </div>
    );
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    setPreparing(true);
    setError(null);
    try {
      const prepared: { blob: Blob; url: string }[] = [];
      for (const f of picked) {
        const blob = await toUploadJpeg(f);
        prepared.push({ blob, url: URL.createObjectURL(blob) });
      }
      setPhotos((prev) => [...prev, ...prepared]);
      if (files.length > room) setError(tr(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.`, `You can add up to ${MAX_PHOTOS} photos.`));
    } catch {
      setError(tr('이 사진은 열지 못했어요. JPG나 PNG로 다시 골라 주세요.', 'Could not open this photo. Please pick a JPG or PNG.'));
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const w = weight.trim() ? Number(weight) : null;
    if (w != null && (Number.isNaN(w) || w < 5 || w > 2000)) {
      setError(tr('체중은 그램 단위 숫자로 적어 주세요. 예: 52', 'Enter the weight in grams, for example 52.'));
      return;
    }
    if (!body.trim() && photos.length === 0) {
      setError(tr('사진이나 글 중 하나는 있어야 해요.', 'A diary needs a photo or some words.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const post = await api.createPost({ body, parrotId, weightG: w, mood, images: photos.map((p) => p.blob) });
      navigate(`/post/${post.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('올리지 못했어요.', 'Could not post.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="page" onSubmit={submit}>
      <h1 className="page-title">{tr('오늘의 앵로그', 'Today\'s diary')}</h1>

      <div className="field">
        <span className="label">{tr('사진', 'Photos')}</span>
        <div className="photo-picker">
          {photos.map((p, i) => (
            <div className="thumb" key={p.url}>
              <img src={p.url} alt={tr(`고른 사진 ${i + 1}`, `Photo ${i + 1}`)} />
              <button type="button" aria-label={tr(`사진 ${i + 1} 빼기`, `Remove photo ${i + 1}`)} onClick={() => setPhotos((prev) => prev.filter((x) => x !== p))}>✕</button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="add">
              {preparing ? tr('준비 중', 'Preparing') : tr('사진 추가', 'Add photos')}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
            </label>
          )}
        </div>
        <span className="hint">{tr('사진의 위치 정보는 올리기 전에 지워져요.', 'Location data is removed from photos before upload.')}</span>
      </div>

      {parrots.length > 1 && (
        <div className="field">
          <span className="label" id="who">{tr('누구 이야기인가요?', 'Who is this about?')}</span>
          <div className="chips" role="group" aria-labelledby="who">
            {parrots.map((p) => (
              <button type="button" key={p.id} className="chip" aria-pressed={parrotId === p.id} onClick={() => setParrotId(p.id)}>{p.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="body">{tr('오늘 있었던 일', 'What happened today')}</label>
        <textarea id="body" className="textarea" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={tr('종이를 세 장 찢어서 꼬리에 꽂았다', 'Shredded three bits of paper and tucked them into her tail')} />
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="weight">{tr('체중 (g)', 'Weight (g)')}</label>
          <input id="weight" className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="52" />
        </div>
      </div>

      <div className="field">
        <span className="label" id="mood">{tr('기분', 'Mood')}</span>
        <div className="chips" role="group" aria-labelledby="mood">
          {MOODS.map((m) => (
            <button type="button" key={m.value} className="chip" aria-pressed={mood === m.value} onClick={() => setMood(mood === m.value ? null : m.value)}>{m.label}</button>
          ))}
        </div>
        <span className="hint">{tr('고른 기분은 내 방 앵무의 모습으로 보여요.', 'The mood shows on your bird in its room.')}</span>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy || preparing}>{busy ? tr('올리는 중', 'Posting') : tr('기록하기', 'Post')}</button>
    </form>
  );
}
