import { setLang, useLang } from '../i18n';

/** 한국어 / English toggle. Shows the language you would switch to. */
export function LangSwitch({ className = 'btn small' }: { className?: string }) {
  const lang = useLang();
  const next = lang === 'ko' ? 'en' : 'ko';
  return (
    <button type="button" className={className} lang={next} onClick={() => setLang(next)}
      aria-label={lang === 'ko' ? 'Switch to English' : '한국어로 보기'}>
      {lang === 'ko' ? 'EN' : '한국어'}
    </button>
  );
}
