const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export async function registerUser(payload) {
  return request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function loginUser(payload) {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function fetchHabits(token) {
  return request('/api/habits', { headers: { Authorization: `Bearer ${token}` } });
}

export async function createHabit(token, name) {
  return request('/api/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

export async function updateHabit(token, id, name) {
  return request(`/api/habits/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

export async function deleteHabit(token, id) {
  return request(`/api/habits/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchToday(token) {
  return request('/api/today', { headers: { Authorization: `Bearer ${token}` } });
}

export async function toggleCompletion(token, habitId, date, completed) {
  return request('/api/completions/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ habitId, date, completed }),
  });
}

export async function fetchCompletions(token, monthKey) {
  return request(`/api/completions?month=${monthKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchCollectibles(token) {
  return request('/api/collectibles', { headers: { Authorization: `Bearer ${token}` } });
}

export async function fetchPublicProfile(username) {
  return request(`/api/profile/${username}`);
}

export { API_BASE };
