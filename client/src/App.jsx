import { useEffect, useMemo, useState } from 'react';
import {
  API_BASE,
  createHabit,
  deleteHabit,
  fetchCollectibles,
  fetchCompletions,
  fetchHabits,
  fetchPublicProfile,
  fetchToday,
  loginUser,
  registerUser,
  toggleCompletion,
  updateHabit,
} from './api';
import './index.css';

const todayKey = new Date().toISOString().slice(0, 10);

function useSession() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');

  const saveSession = (nextToken, nextUsername) => {
    setToken(nextToken);
    setUsername(nextUsername);
    localStorage.setItem('token', nextToken);
    localStorage.setItem('username', nextUsername);
  };

  const clearSession = () => {
    setToken(null);
    setUsername('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  };

  return { token, username, saveSession, clearSession };
}

function Heatmap({ days, onPrev, onNext, monthLabel }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Habits Heatmap</p>
          <h2>{monthLabel}</h2>
        </div>
        <div className="actions">
          <button className="ghost" onClick={onPrev}>
            ◀
          </button>
          <button className="ghost" onClick={onNext}>
            ▶
          </button>
        </div>
      </div>
      <div className="heatmap">
        {days.map((day) => {
          const dateObj = new Date(day.date);
          const isFuture = dateObj > new Date();
          let tone = 'future';
          if (!isFuture) {
            if (day.percentage >= 90) tone = 'great';
            else if (day.percentage >= 50) tone = 'ok';
            else if (day.percentage > 0) tone = 'low';
            else tone = 'empty';
          }
          return (
            <div key={day.date} className={`heatmap-cell ${tone}`} title={`${day.date}: ${day.percentage}%`}>
              {day.percentage ? `${day.percentage}%` : ''}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span className="pill great">90-100%</span>
        <span className="pill ok">50-89%</span>
        <span className="pill low">1-49%</span>
        <span className="pill empty">No data</span>
        <span className="pill future">Future</span>
      </div>
    </div>
  );
}

function Collectibles({ items }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Collectibles</p>
          <h2>Your gallery</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty">Complete 90% of your daily habits to earn collectibles!</div>
      ) : (
        <div className="collectibles">
          {items.map((item) => (
            <div key={item.collectible_filename} className="collectible-card">
              <img src={`${API_BASE}/awards/${item.collectible_filename}`} alt={item.collectible_filename} />
              <div>
                <p className="eyebrow">Earned {item.earned_date}</p>
                <p className="strong">{item.collectible_filename.replace('.svg', '').replace(/_/g, ' ')}</p>
                <p className="muted">Completion {item.completion_percentage}%</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HabitsList({ habits, onAdd, onUpdate, onDelete }) {
  const [newHabit, setNewHabit] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const startEdit = (habit) => {
    setEditing(habit.id);
    setDraft(habit.name);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">My Habits</p>
          <h2>Editable list</h2>
        </div>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newHabit.trim()) return;
          onAdd(newHabit.trim());
          setNewHabit('');
        }}
      >
        <input
          type="text"
          placeholder="Add a new habit"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      <div className="habit-list">
        {habits.map((habit) => (
          <div key={habit.id} className="habit-row">
            {editing === habit.id ? (
              <input value={draft} onChange={(e) => setDraft(e.target.value)} />
            ) : (
              <span>{habit.name}</span>
            )}
            <div className="actions">
              {editing === habit.id ? (
                <>
                  <button
                    className="ghost"
                    onClick={() => {
                      onUpdate(habit.id, draft);
                      setEditing(null);
                    }}
                  >
                    Save
                  </button>
                  <button className="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="ghost" onClick={() => startEdit(habit)}>
                    Edit
                  </button>
                  <button className="danger" onClick={() => onDelete(habit.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayTracker({ habits, onToggle }) {
  const completedCount = habits.filter((h) => h.completed).length;
  const total = habits.length || 1;
  const percentage = Math.round((completedCount / total) * 100);
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Daily Tracker</p>
          <h2>
            Today — {completedCount}/{total} ({percentage}%)
          </h2>
        </div>
      </div>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${percentage}%` }} />
      </div>
      <div className="today-list">
        {habits.map((habit) => (
          <label key={habit.id} className={`today-row ${habit.completed ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(habit.completed)}
              onChange={(e) => onToggle(habit.id, e.target.checked)}
            />
            <span>{habit.name}</span>
          </label>
        ))}
        {habits.length === 0 && <div className="empty">Add habits to start tracking today.</div>}
      </div>
      <div className={`reward-hint ${percentage >= 90 ? 'highlight' : ''}`}>
        Reach 90% to earn a collectible!
      </div>
    </div>
  );
}

function PublicProfilePreview({ username }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) return;
    fetchPublicProfile(username)
      .then(setProfile)
      .catch(() => setError('Public profile not available yet.')); 
  }, [username]);

  const link = `${window.location.origin}/profile/${username}`;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Public profile</p>
          <h2>Share your progress</h2>
        </div>
      </div>
      <div className="share-row">
        <input value={link} readOnly />
        <button
          onClick={() => {
            navigator.clipboard.writeText(link);
          }}
        >
          Copy link
        </button>
      </div>
      {profile && (
        <div className="profile-preview">
          <div>
            <p className="eyebrow">@{profile.username}</p>
            <p className="strong">Collectibles: {profile.totalCollectibles}</p>
            <p className="muted">Member since {profile.memberSince?.slice(0, 10)}</p>
          </div>
          <div className="tiny-heatmap">
            {profile.summary.map((day) => {
              let tone = 'future';
              const dateObj = new Date(day.date);
              if (dateObj <= new Date()) {
                if (day.percentage >= 90) tone = 'great';
                else if (day.percentage >= 50) tone = 'ok';
                else if (day.percentage > 0) tone = 'low';
                else tone = 'empty';
              }
              return <span key={day.date} className={`mini-cell ${tone}`} title={`${day.date} ${day.percentage}%`} />;
            })}
          </div>
        </div>
      )}
      {error && <div className="empty">{error}</div>}
    </div>
  );
}

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const isRegister = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister && form.password !== form.confirm) {
        setError('Passwords must match');
        return;
      }
      const payload = { username: form.username, password: form.password };
      let data;
      if (isRegister) {
        data = await registerUser({ ...payload, email: form.email });
      } else {
        data = await loginUser(payload);
      }
      onAuth(data.token, form.username);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-card">
      <p className="eyebrow">Welcome</p>
      <h1>{isRegister ? 'Create account' : 'Sign in'}</h1>
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>Username</span>
          <input
            required
            minLength={3}
            maxLength={20}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        {isRegister && (
          <label>
            <span>Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
        )}
        <label>
          <span>Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {isRegister && (
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              required
              minLength={8}
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </label>
        )}
        {error && <div className="error">{error}</div>}
        <button type="submit">{isRegister ? 'Register & start' : 'Login'}</button>
      </form>
      <button className="ghost" onClick={() => setMode(isRegister ? 'login' : 'register')}>
        {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
      </button>
    </div>
  );
}

function App() {
  const session = useSession();
  const [habits, setHabits] = useState([]);
  const [todayHabits, setTodayHabits] = useState([]);
  const [collectibles, setCollectibles] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [month, setMonth] = useState(() => new Date());
  const [message, setMessage] = useState('');

  const monthKey = useMemo(() => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`, [month]);
  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (!session.token) return;
    loadAll();
  }, [session.token, monthKey]);

  const loadAll = async () => {
    try {
      const [habitsRes, todayRes, completionsRes, collectiblesRes] = await Promise.all([
        fetchHabits(session.token),
        fetchToday(session.token),
        fetchCompletions(session.token, monthKey),
        fetchCollectibles(session.token),
      ]);
      setHabits(habitsRes.habits);
      setTodayHabits(todayRes.habits);
      setCompletions(completionsRes.days);
      setCollectibles(collectiblesRes.collectibles);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleToggle = async (habitId, completed) => {
    await toggleCompletion(session.token, habitId, todayKey, completed);
    const updated = todayHabits.map((h) => (h.id === habitId ? { ...h, completed: completed ? 1 : 0 } : h));
    setTodayHabits(updated);
    loadAll();
  };

  const handleAddHabit = async (name) => {
    await createHabit(session.token, name);
    loadAll();
  };

  const handleUpdateHabit = async (id, name) => {
    await updateHabit(session.token, id, name);
    loadAll();
  };

  const handleDeleteHabit = async (id) => {
    if (!confirm('Delete this habit?')) return;
    await deleteHabit(session.token, id);
    loadAll();
  };

  const shiftMonth = (delta) => {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    setMonth(next);
  };

  if (!session.token) {
    return (
      <div className="layout auth-layout">
        <AuthForm onAuth={session.saveSession} />
      </div>
    );
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <p className="eyebrow">Hi, {session.username}</p>
          <h1>Ready to build some habits?</h1>
        </div>
        <div className="actions">
          <button className="ghost" onClick={session.clearSession}>
            Logout
          </button>
        </div>
      </header>
      {message && <div className="error">{message}</div>}
      <div className="grid two">
        <Heatmap
          days={completions}
          monthLabel={monthLabel}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />
        <Collectibles items={collectibles} />
      </div>
      <div className="grid two">
        <HabitsList habits={habits} onAdd={handleAddHabit} onUpdate={handleUpdateHabit} onDelete={handleDeleteHabit} />
        <TodayTracker habits={todayHabits} onToggle={handleToggle} />
      </div>
      <PublicProfilePreview username={session.username} />
    </div>
  );
}

export default App;
