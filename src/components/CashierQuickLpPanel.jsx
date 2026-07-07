import PageSection from './PageSection.jsx';

const QUICK_LP_AMOUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Kasiyer — QR sonrası tek dokunuşla 1–10 LP ekleme
export default function CashierQuickLpPanel({ busy = false, onAddLp }) {
  return (
    <PageSection label="Hızlı LP" tight>
      <div className="cashierQuickLpPanel">
        <p className="cashierQuickLpHint">Tek dokunuşla hesaba LP ekle.</p>
        <div className="cashierQuickLpGrid" role="group" aria-label="Hızlı LP miktarı">
          {QUICK_LP_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              className="cashierQuickLpBtn"
              disabled={busy}
              onClick={() => onAddLp?.(amount)}
            >
              +{amount}
            </button>
          ))}
        </div>
      </div>
    </PageSection>
  );
}
