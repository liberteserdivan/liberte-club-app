import { useState } from 'react';
import { Bell, QrCode, Sparkles, X } from 'lucide-react';

const STEPS = [
  {
    icon: QrCode,
    title: 'Kasada QR göster',
    body: 'Kartım sekmesinden QR kodunu kasiyere göster; alışverişlerin Liberte Puan olarak hesabına işlensin.'
  },
  {
    icon: Sparkles,
    title: 'LP biriktir, ikram kazan',
    body: 'Kahve +1 LP, tatlı +2 LP, burger +3 LP. 7 LP kahve, 15 LP tatlı, 25 LP burger ikramı.'
  },
  {
    icon: Bell,
    title: 'Kampanyalardan haberdar ol',
    body: 'Bildirimleri aç; yeni fırsat ve ödül duyurularını kaçırma.'
  }
];

function storageKey(customerId) {
  return `liberteOnboarded:${customerId}`;
}

// İlk girişte kısa tanıtım — müşteri yolculuğu
export function shouldShowOnboarding(customerId) {
  if (!customerId) return false;
  try {
    return localStorage.getItem(storageKey(customerId)) !== '1';
  } catch {
    return false;
  }
}

export function markOnboardingDone(customerId) {
  if (!customerId) return;
  try {
    localStorage.setItem(storageKey(customerId), '1');
  } catch {
    // Depolama kapalıysa sessizce geç
  }
}

export default function OnboardingOverlay({ customerId, onDone }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step >= STEPS.length - 1;

  function finish() {
    markOnboardingDone(customerId);
    onDone?.();
  }

  function next() {
    if (isLast) {
      finish();
      return;
    }
    setStep((value) => value + 1);
  }

  return (
    <div className="onboardingOverlay" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle">
      <div className="onboardingCard">
        <button type="button" className="onboardingSkip" onClick={finish} aria-label="Tanıtımı atla">
          <X size={18} />
        </button>
        <div className="onboardingIcon"><Icon size={28} aria-hidden="true" /></div>
        <span className="onboardingStep">{step + 1} / {STEPS.length}</span>
        <h2 id="onboardingTitle">{current.title}</h2>
        <p>{current.body}</p>
        <div className="onboardingDots" aria-hidden="true">
          {STEPS.map((_, index) => (
            <i key={index} className={index === step ? 'isActive' : ''} />
          ))}
        </div>
        <button type="button" className="goldBtn onboardingNext" onClick={next}>
          {isLast ? 'Başla' : 'Devam'}
        </button>
      </div>
    </div>
  );
}
