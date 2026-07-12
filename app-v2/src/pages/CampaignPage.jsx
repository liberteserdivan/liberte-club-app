import PageHero from '../components/PageHero.jsx';

export default function CampaignPage({ state }) {
  const campaign = state?.dailyCampaign;
  const notes = (state?.notifications || []).slice(0, 8);

  return (
    <div data-testid="campaign-page">
      <PageHero title="Kampanyalar" subtitle="Fırsatlar ve duyurular" />
      {campaign && campaign.active !== false && (
        <div className="card">
          <b>{campaign.title || 'Günün kampanyası'}</b>
          <p className="muted">{campaign.body}</p>
        </div>
      )}
      {!notes.length && <div className="card"><p className="muted">Henüz duyuru yok.</p></div>}
      {notes.map((n) => (
        <div className="card" key={n.id || n.title}>
          <b>{n.title}</b>
          <p className="muted">{n.body}</p>
        </div>
      ))}
    </div>
  );
}
