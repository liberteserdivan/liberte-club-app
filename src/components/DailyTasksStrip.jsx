import { Check, Coffee, Gift, Sparkles, Sun } from 'lucide-react';
import { getCustomerStreak, getDailyTasks } from '../lib/db.js';

const ICONS = { sun: Sun, sparkles: Sparkles, coffee: Coffee, gift: Gift };

// Ana sayfada günlük görev şeridi
export default function DailyTasksStrip({ db, customer, setTab }) {
  const tasks = getDailyTasks(db, customer.id);
  const streak = getCustomerStreak(db, customer.id);
  const doneCount = tasks.filter(t => t.done).length;

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
      <div className="dailyTasksScroll">
        {tasks.map(task => {
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
