import { isEn } from '../i18n';
/**
 * The only things people can "say" in 앵파크. Free chat would need moderation, so speech is a fixed
 * list and only the index travels over the network. The realtime server checks the index against
 * angpark.phrase-count, so add new lines at the end and raise that number together.
 */
export const PHRASES = [
  '안녕!',
  '반가워요',
  '같이 놀자',
  '짹짹!',
  '귀여워요',
  '단풍 예쁘다',
  '어디 살아요?',
  '우리 집 놀러 와요',
  '고마워요',
  '또 만나요',
  '배고파...',
  '졸려...',
] as const;

// The same lines in English, in the same order: only the number travels, so everyone reads them in their own language.
const PHRASES_EN = [
  'Hi!',
  'Nice to meet you',
  'Let\'s play',
  'Tweet tweet!',
  'So cute',
  'Pretty leaves',
  'Where do you live?',
  'Come visit my house',
  'Thank you',
  'See you again',
  'Hungry...',
  'Sleepy...',
] as const;

/** Phrase n in the screen's language. */
export const phraseText = (n: number): string | undefined => (isEn() ? PHRASES_EN[n] : PHRASES[n]);
