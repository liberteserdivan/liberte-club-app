import { useState } from 'react';
import { Check, Coffee, Gift, Sparkles, Sun } from 'lucide-react';
import { claimDailyLoginReward, getCustomerStreak, getDailyTasks, hasDailyClaim } from '../lib/db.js';
import { claimDailyLoginRewardRemote } from '../lib/customerRewardsClient.js';
import { isLocalAuth } from '../lib/devAuth.js';

const ICONS = { sun: Sun, sparkles: Sparkles, coffee: Coffee, gift: Gift };

// Ana sayfada günlük görev şeridi
export default function DailyTasksStrip({ db, customer, commit, setTab }) {
  const [claimMessage, setClaimMessage] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const tasks = getDailyTasks(db, customer.id);
  const streak = getCustomerStreak(db, customer.id);
  const doneCount = tasks.filter((task) => task.done).length;
  const dailyClaimed = hasDailyClaim(db, customer.id, 'daily_login');

  async function handleDailyClaim() {
    if (dailyClaimed) {
      setClaimMessage('Günlük giriş ödülünü bugün zaten aldın.');
      return;
    }

    setClaimLoading(true);
    setClaimMessage('');

    try {
      if (isLocalAuth()) {
        const result = claimDailyLoginReward(db, customer.id);
        if (!result.ok) {
          setClaimMessage(result.message);
          return;
        }
        commit(result.db);
        setClaimMessage(result.message);
        return;
      }

      const remote = await claimDailyLoginRewardRemote();
      commit((current) => ({
        ...current,
        loyalty: {
          ...(current.loyalty || {}),
          [customer.id]: remote.loyalty
        },
        dailyClaims: remote.dailyClaims || current.dailyClaims || []
      }), { skipRemote: true });
      setClaimMessage(remote.message || '+1 LP günlük giriş ödülü hesabına eklendi.');
    } catch (error) {
      setClaimMessage(error?.message || 'Günlük ödül kaydedilemedi.');
    } finally {
      setClaimLoading(false);
    }
  }

  return (
    <div className="dailyTasksStrip">
      <div className="dailyTasksHead">
        <div>
          <span>BUGÜN</span>
          <h3>Günlük görevler</h3>
        </div>
        <div className="dailyTasksMeta">
          {streak > 0 && <span className="streakBadge">🔥 {streak} gün seri</span>}
          <em>{doneCount}/{tasks.length}</em>
        </div>
      </div>

      {!dailyClaimed && (
        <button
          type="button"
          className="dailyClaimBtn goldBtn"
          onClick={handleDailyClaim}
          disabled={claimLoading}
        >
          {claimLoading ? 'Kaydediliyor…' : 'Günlük giriş ödülünü al (+1 LP)'}
        </button>
      )}
      {claimMessage && <p className="dailyClaimMessage">{claimMessage}</p>}

      <div className="dailyTasksScroll">
        {tasks.map((task) => {
          const Icon = ICONS[task.icon] || Sparkles;
          return (
            <button
              key={task.id}
              type="button"
              className={`dailyTaskChip${task.done ? ' isDone' : ''}`}
              onClick={() => setTab(task.tab)}
            >
              <div className="dailyTaskIcon">
                <Icon size={18} />
                {task.done && <Check size={12} className="dailyTaskCheck" />}
              </div>
              <b>{task.label}</b>
              <small>{task.desc}</small>
              {task.progress != null && !task.done && (
                <span className="dailyTaskBar"><i style={{ width: `${task.progress}%` }} /></span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
