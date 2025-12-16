import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(msg.error || 'Request failed');
  }
  return res.json();
};

const ProgressBar = ({ percent }) => (
  <div className="progress">
    <div className="progress-inner" style={{ width: `${percent}%` }} />
  </div>
);

const Heatmap = ({ data, totalHabits, onPrev, onNext, month }) => {
  const daysInMonth = dayjs(month).daysInMonth();
  const startOfMonth = dayjs(month).startOf('month');
  const cells = [];
  for (let i = 0; i < daysInMonth; i += 1) {
    const date = startOfMonth.add(i, 'day');
    const iso = date.format('YYYY-MM-DD');
    const rate = data[iso] ?? null;
    let tone = 'future';
    if (rate !== null) {
      if (rate >= 0.9) tone = 'green';
      else if (rate >= 0.5) tone = 'yellow';
      else tone = 'red';
    } else if (date.isBefore(dayjs(), 'day')) {
      tone = 'gray';
    }
    cells.push(
      <div key={iso} className={`heat-cell ${tone}`} title={rate !== null ? `${Math.round(rate * 100)}%` : 'No data'}>
        {date.date()}
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="panel-header">
        <button onClick={onPrev}>Prev</button>
        <h3>{dayjs(month).format('MMMM YYYY')}</h3>
        <button onClick={onNext}>Next</button>
      </div>
      <div className="heat-grid">{cells}</div>
      <p className="caption">Total habits: {totalHabits}</p>
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState('');
  const [today, setToday] = useState({ date: '', habits: [] });
  const [collectibles, setCollectibles] = useState([]);
  const [heatmap, setHeatmap] = useState({ data: {}, totalHabits: 0 });
  const [monthCursor, setMonthCursor] = useState(dayjs().startOf('month'));

  const loadUser = async () => {
    try {
      const data = await api('/api/me');
      setUser(data);
    } catch {
      setUser(null);
    }
  };

  const loadDashboard = async () => {
    if (!user) return;
    const [habitData, todayData, collectibleData, heatmapData] = await Promise.all([
      api('/api/habits'),
      api('/api/today'),
      api('/api/collectibles'),
      api('/api/heatmap'),
    ]);
    setHabits(habitData);
    setToday(todayData);
    setCollectibles(collectibleData);
    setHeatmap(heatmapData);
  };

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user]);

  const submitAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (authMode === 'login') {
        const data = await api('/api/login', {
          method: 'POST',
          body: JSON.stringify({ username: form.username, password: form.password }),
        });
        setUser(data);
      } else {
        const data = await api('/api/register', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setUser(data);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const addHabit = async () => {
    if (!newHabit.trim()) return;
    try {
      const habit = await api('/api/habits', { method: 'POST', body: JSON.stringify({ name: newHabit }) });
      setHabits([...habits, habit]);
      setNewHabit('');
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const updateHabitName = async (id, name) => {
    try {
      await api(`/api/habits/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, name } : h)));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteHabit = async (id) => {
    if (!confirm('Delete this habit?')) return;
    await api(`/api/habits/${id}`, { method: 'DELETE' });
    setHabits((prev) => prev.filter((h) => h.id !== id));
    loadDashboard();
  };

  const toggleCompletion = async (habitId, completed) => {
    const result = await api('/api/completions', {
      method: 'POST',
      body: JSON.stringify({ habitId, completed }),
    });
    setToday((prev) => ({
      ...prev,
      habits: prev.habits.map((h) => (h.id === habitId ? { ...h, completed } : h)),
    }));
    if (result.awarded) {
      await loadDashboard();
      alert('New collectible earned!');
    }
  };

  const completionStats = useMemo(() => {
    const total = today.habits?.length || 0;
    const done = today.habits?.filter((h) => h.completed).length || 0;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { done, total, percent };
  }, [today]);

  const renderAuth = () => (
    <div className="auth-card">
      <h1>Habit Quest</h1>
      <p className="subtitle">Track habits, earn collectibles, and share your progress.</p>
      <div className="toggle">
        <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
          Login
        </button>
        <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
          Register
        </button>
      </div>
      <form onSubmit={submitAuth} className="form">
        <input
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />
        {authMode === 'register' && (
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        )}
        <input
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        {authMode === 'register' && (
          <input
            placeholder="Confirm password"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
          />
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">
          {authMode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>
    </div>
  );

  const shareLink = user ? `${window.location.origin}/profile/${user.username}` : '';

  return (
    <div className="app">
      {!user ? (
        renderAuth()
      ) : (
        <div className="layout">
          <header className="header">
            <div>
              <h2>Hello, {user.username}</h2>
              <p>Ready to build some habits?</p>
            </div>
            <div className="share">
              <input readOnly value={shareLink} />
              <button onClick={() => navigator.clipboard.writeText(shareLink)}>Copy link</button>
            </div>
          </header>

          <section className="grid">
            <div className="panel">
              <div className="panel-header">
                <h3>Today's Tasks</h3>
                <span>
                  {completionStats.done}/{completionStats.total} ({completionStats.percent}%)
                </span>
              </div>
              <ProgressBar percent={completionStats.percent} />
              <ul className="habit-list">
                {today.habits?.map((habit) => (
                  <li key={habit.id} className={habit.completed ? 'done' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={habit.completed}
                        onChange={(e) => toggleCompletion(habit.id, e.target.checked)}
                      />
                      <span>{habit.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <Heatmap
              data={heatmap.data || {}}
              totalHabits={heatmap.totalHabits || 0}
              month={monthCursor}
              onPrev={() => setMonthCursor(monthCursor.subtract(1, 'month'))}
              onNext={() => setMonthCursor(monthCursor.add(1, 'month'))}
            />

            <div className="panel">
              <div className="panel-header">
                <h3>My Habits</h3>
              </div>
              <div className="habit-input">
                <input
                  placeholder="Add a new habit"
                  value={newHabit}
                  onChange={(e) => setNewHabit(e.target.value)}
                  maxLength={100}
                />
                <button onClick={addHabit}>Add</button>
              </div>
              <ul className="habit-list editable">
                {habits.map((habit) => (
                  <HabitRow key={habit.id} habit={habit} onSave={updateHabitName} onDelete={deleteHabit} />
                ))}
              </ul>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h3>Collectibles</h3>
              </div>
              {collectibles.length === 0 ? (
                <p className="muted">Complete 90% of your daily habits to earn collectibles!</p>
              ) : (
                <div className="collectible-grid">
                  {collectibles.map((c) => (
                    <div key={c.id} className="collectible-card">
                      <img src={`/awards/${c.collectible_filename}`} alt={c.collectible_filename} />
                      <div>
                        <strong>{c.collectible_filename.replace('.svg', '').replace('_', ' ')}</strong>
                        <p>Earned {dayjs(c.earned_date).format('MMM D, YYYY')}</p>
                        <p>{Math.round((c.completion_percentage || 0) * 100)}% day</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function HabitRow({ habit, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(habit.name);
  return (
    <li className="habit-row">
      {editing ? (
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <span>{habit.name}</span>
      )}
      <div className="actions">
        {editing ? (
          <button
            onClick={() => {
              onSave(habit.id, value);
              setEditing(false);
            }}
          >
            Save
          </button>
        ) : (
          <button onClick={() => setEditing(true)}>Edit</button>
        )}
        <button className="danger" onClick={() => onDelete(habit.id)}>
          Delete
        </button>
      </div>
    </li>
  );
}

export default App;
