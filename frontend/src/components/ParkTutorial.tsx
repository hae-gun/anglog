import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { tr } from '../i18n';

// 첫 산책: 모란이가 공원을 안내하는 튜토리얼. 한 번에 하나씩 시키고, 해내면 다음으로 넘어간다("다음" 버튼은 없다).
// 걷기, 둘러보기, 날아서 가지에 앉기, 짹짹 박자 맞추기(모란이가 따라 부름), 모란이 찌르기. 끝나면 랜덤 색 목도리.
// park.js는 모란이와 노란 표시만 그리고, 어떤 단계인지와 넘어가는 판단은 여기서 한다.

export interface TutorialPark {
  /** looked: how far I have turned the camera myself so far (radians); the camera turning on its own does not count */
  tutorialState(): { x: number; y: number; z: number; yaw: number; looked: number; flying: boolean; sitting: boolean; busy: boolean };
  guideShow(name: string): boolean;
  guideSay(text: string, sec?: number): void;
  markAhead(dist?: number): { x: number; z: number };
  markPerch(): { x: number; y: number; z: number } | null;
  unmark(): void;
  guideCome(): void;
  guideBye(text?: string): void;
}

type Step = 'wait' | 'hello' | 'walk' | 'look' | 'fly' | 'chirp' | 'prank' | 'done';
const ORDER: Step[] = ['walk', 'look', 'fly', 'chirp', 'prank'];

export function ParkTutorial({ park, events, loggedIn, onFinish, onSkip }: {
  park: () => TutorialPark | null;
  /** 'chorus' and 'pranked' from the park */
  events: EventTarget;
  loggedIn: boolean;
  /** finished all steps: give the scarf, returns its colour */
  onFinish: () => string;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<Step>('wait');
  const [scarf, setScarf] = useState<string | null>(null);
  const target = useRef<{ x: number; z: number } | null>(null);
  const lookedAtStart = useRef(0);

  const name = tr('모란이', 'Moran');
  const say = (ko: string, en: string, sec = 4) => park()?.guideSay(tr(ko, en), sec);

  // wait until I have landed at the gate, then 모란이 flies in
  useEffect(() => {
    if (step !== 'wait') return undefined;
    const t = window.setInterval(() => {
      const p = park();
      if (!p || p.tutorialState().busy) return;
      if (p.guideShow(name)) {
        window.clearInterval(t);
        setStep('hello');
      }
    }, 300);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // what 모란이 says and marks when a step starts
  useEffect(() => {
    const p = park();
    if (!p) return undefined;
    let t = 0;
    switch (step) {
      case 'hello':
        t = window.setTimeout(() => say('안녕! 나는 모란이야. 공원 구경 시켜 줄게!', 'Hi! I am Moran. Let me show you the park!', 3.2), 1400);
        {
          const go = window.setTimeout(() => setStep('walk'), 4800);
          return () => { window.clearTimeout(t); window.clearTimeout(go); };
        }
      case 'walk':
        target.current = p.markAhead(6);
        say('저 노란 동그라미까지 걸어와 봐!', 'Walk over to that yellow circle!');
        break;
      case 'look': {
        p.unmark();
        lookedAtStart.current = p.tutorialState().looked;
        say('잘했어! 이제 주변을 둘러볼까?', 'Nice! Now take a look around.');
        break;
      }
      case 'fly':
        if (!p.markPerch()) { setStep('chirp'); break; }
        t = window.setTimeout(() => say('나 여기 있어! 날아와서 앉아 봐', 'Up here! Fly over and sit with me'), 1600);
        break;
      case 'chirp':
        p.unmark();
        p.guideCome();
        t = window.setTimeout(() => say('멋지다! 이제 같이 노래하자. 짹짹을 박자 맞춰 세 번!', 'Great! Let\'s sing. Chirp three times in a rhythm!', 4.5), 1200);
        break;
      case 'prank':
        say('우와, 합창이다! 마지막으로 나를 콕 찔러 봐 ㅎㅎ', 'A choir! Last one: poke me, go on!', 4);
        break;
      case 'done':
        setScarf(onFinish());
        p.guideBye(tr('잘했어! 이건 선물이야. 목도리 잘 어울린다!', 'Well done! A present for you. The scarf suits you!'));
        break;
      default:
        break;
    }
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // checking whether the step is done
  useEffect(() => {
    if (step !== 'walk' && step !== 'look' && step !== 'fly') return undefined;
    const t = window.setInterval(() => {
      const p = park();
      if (!p) return;
      const s = p.tutorialState();
      if (step === 'walk' && target.current && Math.hypot(s.x - target.current.x, s.z - target.current.z) < 1.5) setStep('look');
      // about a quarter turn of my own dragging (left and back right counts too)
      if (step === 'look' && s.looked - lookedAtStart.current > 1.4) setStep('fly');
      if (step === 'fly' && s.sitting && s.y > 0.4) setStep('chirp');
    }, 200);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const chorus = () => setStep((s) => (s === 'chirp' ? 'prank' : s));
    const pranked = () => setStep((s) => (s === 'prank' ? 'done' : s));
    events.addEventListener('chorus', chorus);
    events.addEventListener('pranked', pranked);
    return () => {
      events.removeEventListener('chorus', chorus);
      events.removeEventListener('pranked', pranked);
    };
  }, [events]);

  const skip = () => {
    park()?.guideBye(tr('언제든 더보기에서 다시 불러 줘!', 'Call me again from More anytime!'));
    onSkip();
  };

  if (step === 'wait') return null;

  if (step === 'done') {
    if (!scarf) return null;
    return (
      <div className="park-tut done" role="dialog" aria-label={tr('첫 산책 완료', 'First walk done')}>
        <div className="park-tut-head">
          <span className="park-tut-scarf" style={{ background: scarf }} aria-hidden="true" />
          <b>{tr('첫 산책 완료! 목도리를 받았어요', 'First walk done! You got a scarf')}</b>
        </div>
        <p>{tr('모란이가 뜬 목도리예요. 다른 앵무들 화면에도 보여요. 집 문을 누르면 그 집에 놀러 갈 수 있어요.', 'Moran knitted it for you, and other birds can see it too. Tap a house door to visit.')}</p>
        {!loggedIn && (
          <p className="park-tut-sub">
            {tr('우리 앵무로 놀고 싶다면 ', 'Want to play as your own parrot? ')}
            <Link to="/login">{tr('앵로그에 가입하기', 'Join Anglog')}</Link>
          </p>
        )}
        <div className="row">
          <button className="btn small primary" onClick={onSkip}>{tr('놀러 가기', 'Go play')}</button>
        </div>
      </div>
    );
  }

  const n = Math.max(0, ORDER.indexOf(step)) + 1;
  const card: Record<Exclude<Step, 'wait' | 'done'>, [string, string]> = {
    hello: [tr('모란이가 공원을 안내해 줄 거예요', 'Moran will show you around'), tr('천천히 따라와 보세요.', 'Just follow along.')],
    walk: [tr('걷기', 'Walk'), tr('조이스틱을 밀거나 바닥을 눌러서 노란 동그라미까지 가 보세요.', 'Push the stick or tap the ground to walk to the yellow circle.')],
    look: [tr('둘러보기', 'Look around'), tr('화면을 끌어서 주변을 빙 둘러보세요.', 'Drag the screen to look around.')],
    fly: [tr('날아서 앉기', 'Fly and sit'), tr('날기를 누르고 노란 동그라미가 있는 가지 위로 가세요. 위아래 버튼으로 높이를 맞추고, 날기를 한 번 더 누르면 내려앉아요.', 'Tap Fly and head over the branch with the yellow circle. Use up and down for height, then tap Fly again to land.')],
    chirp: [tr('짹짹', 'Chirp'), tr('짹짹 버튼을 박자 맞춰 세 번 넘게 눌러 보세요. 모란이가 따라 불러요.', 'Tap Chirp three or more times in a rhythm. Moran sings it back.')],
    prank: [tr('장난치기', 'Prank'), tr('장난 버튼을 누르고 하나 골라서 모란이에게 장난을 쳐 보세요.', 'Tap Prank and pick one to play a trick on Moran.')],
  };
  const [title, body] = card[step];
  return (
    <div className="park-tut" role="status" aria-live="polite">
      <div className="park-tut-head">
        {step !== 'hello' && <span className="park-tut-n">{n}/{ORDER.length}</span>}
        <b>{title}</b>
        <button className="park-tut-skip" onClick={skip}>{tr('건너뛰기', 'Skip')}</button>
      </div>
      <p>{body}</p>
      {step !== 'hello' && (
        <div className="park-tut-dots" aria-hidden="true">
          {ORDER.map((s, i) => <span key={s} className={i < n - 1 ? 'on' : i === n - 1 ? 'now' : ''} />)}
        </div>
      )}
    </div>
  );
}
