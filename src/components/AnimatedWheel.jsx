import React, { useEffect, useRef, useState } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { applyWheelPrize, localDayKey, seed, weightedPrize } from '../lib/db.js';

const SPIN_MS = 4500;
const WHEEL_COLORS = ['#0B2F26', '#1F5D4F', '#B9945E', '#9FDCC7', '#16473A', '#D8C29D', '#2A6B58', '#C4A574'];

// Ödül tipine göre segment emojisi
function prizeEmoji(prize) {
  if (prize.type === 'stamp') return '🎫';
  if (prize.type === 'reward') return '☕';
  return '✨';
}

// Kazanan segmente inecek dönüş açısını hesaplar
function calcSpinAngle(prizeIndex, total, currentRotation) {
  const segment = 360 / total;
  const fullTurns = 5 + Math.floor(Math.random() * 3);
  const landOffset = 360 - prizeIndex * segment - segment / 2;
  return currentRotation + fullTurns * 360 + landOffset;
}

// Conic-gradient arka planını üretir
function buildWheelGradient(prizes) {
  const n = prizes.length;
  const stops = prizes.map((_, i) => {
    const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
    const start = (i / n) * 100;
    const end = ((i + 1) / n) * 100;
    return `${color} ${start}% ${end}%`;
  });
  return `conic-gradient(from -90deg, ${stops.join(', ')})`;
}

export default function AnimatedWheel({ db, customer, commit }) {
  const prizes = db.wheelPrizes?.length ? db.wheelPrizes : seed.wheelPrizes;
  const todaySpin = (db.wheelSpins || []).find(x => x.customerId === customer.id && x.day === localDayKey());
  const alreadySpun = Boolean(todaySpin);

  const [entered, setEntered] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const discRef = useRef(null);
  const spinningRef = useRef(false);
  const pendingPrizeRef = useRef(null);

  const segmentAngle = 360 / prizes.length;
  const gradient = buildWheelGradient(prizes);

  // Sayfa açılış animasyonu
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Bugün çevrilmişse çarkı kazanan segmente hizala
  useEffect(() => {
    if (!alreadySpun || wonPrize || spinningRef.current) return;
    const idx = prizes.findIndex(p => p.label === todaySpin.prize);
    if (idx >= 0) {
      const seg = 360 / prizes.length;
      setRotation(360 - idx * seg - seg / 2);
    }
  }, [alreadySpun, todaySpin, prizes, wonPrize]);

  // Dönüş bitince ödülü kaydet ve sonuç kartını aç
  function handleTransitionEnd(e) {
    if (e.propertyName !== 'transform' || !spinningRef.current) return;
    spinningRef.current = false;
    setSpinning(false);
    const prize = pendingPrizeRef.current;
    if (!prize) return;
    commit(applyWheelPrize(db, customer.id, prize));
    setShowResult(true);
  }

  function startSpin() {
    if (spinningRef.current || alreadySpun) return;
    const prize = weightedPrize(prizes);
    const idx = prizes.findIndex(p => p.id === prize.id);
    pendingPrizeRef.current = prize;
    setWonPrize(prize);
    spinningRef.current = true;
    setSpinning(true);
    setRotation(prev => calcSpinAngle(idx >= 0 ? idx : 0, prizes.length, prev));
  }

  function closeResult() {
    setShowResult(false);
  }

  return (
    <div className={`wheelStage${entered ? ' isEntered' : ''}`}>
      <div className="wheelCard">
        <div className="wheelCardHead">
          <Sparkles size={18} />
          <div>
            <span>ŞANS ÇARKI</span>
            <h3>Günde bir kez çevir</h3>
          </div>
        </div>

        <div className={`wheelArena${spinning ? ' isSpinning' : ''}`}>
          <div className="wheelGlow" aria-hidden="true" />
          <div className="wheelPointer" aria-hidden="true">
            <span />
          </div>

          <div
            ref={discRef}
            className="wheelDisc"
            style={{
              background: gradient,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.85, 0.22, 1)` : 'none'
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            <div className="wheelRing" aria-hidden="true" />
            {prizes.map((prize, i) => (
              <div
                key={prize.id ?? i}
                className="wheelSegmentLabel"
                style={{ transform: `rotate(${i * segmentAngle + segmentAngle / 2}deg)` }}
              >
                <span>{prizeEmoji(prize)}</span>
                <small>{prize.label.split(' ').slice(0, 2).join(' ')}</small>
              </div>
            ))}
            <button
              type="button"
              className="wheelHub"
              onClick={startSpin}
              disabled={spinning || alreadySpun}
              aria-label={alreadySpun ? 'Bugün çevrildi' : 'Çarkı çevir'}
            >
              {spinning ? '…' : alreadySpun ? '✓' : 'ÇEVİR'}
            </button>
          </div>
        </div>

        <p className="wheelHint">
          {alreadySpun && !spinning
            ? `Bugünkü ödülün: ${todaySpin?.prize || wonPrize?.label}`
            : spinning
              ? 'Çark dönüyor, şansın açılsın…'
              : 'Damga, ikram veya sürpriz kazan.'}
        </p>

        {!alreadySpun && !spinning && (
          <button type="button" className="goldBtn wheelSpinBtn" onClick={startSpin}>
            <Gift size={18} /> Şansımı Dene
          </button>
        )}
      </div>

      {showResult && wonPrize && (
        <div className="wheelResultBackdrop" onClick={closeResult} role="presentation">
          <div className="wheelResultCard" onClick={e => e.stopPropagation()}>
            <div className="wheelResultBurst" aria-hidden="true">
              <Sparkles />
            </div>
            <span>Tebrikler!</span>
            <h4>{wonPrize.label}</h4>
            <p>
              {wonPrize.type === 'stamp' && `Hesabına +${wonPrize.value} damga eklendi.`}
              {wonPrize.type === 'reward' && 'İkram hakkın hesabına tanımlandı.'}
              {wonPrize.type === 'message' && 'Bugün senin günün — kasada söyle, sürpriz seni bekliyor.'}
            </p>
            <button type="button" className="goldBtn" onClick={closeResult}>Harika!</button>
          </div>
        </div>
      )}
    </div>
  );
}
