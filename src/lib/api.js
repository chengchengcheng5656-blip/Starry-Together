async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  me: () => request('/api/me'),
  logout: () => request('/api/logout', { method: 'POST', body: '{}' }),
  sky: () => request('/api/sky'),
  startWechat: () => request('/auth/wechat'),
  localWechat: (payload) => request('/auth/wechat/local', { method: 'POST', body: JSON.stringify(payload) }),
  createStar: (payload) => request('/api/stars', { method: 'POST', body: JSON.stringify(payload) }),
  updateStar: (id, payload) => request(`/api/stars/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  restStar: (id) => request(`/api/stars/${id}/rest`, { method: 'POST', body: '{}' }),
  discoverStar: (id) => request(`/api/stars/${id}/discover`, { method: 'POST', body: '{}' }),
  releaseEaster: () => request('/api/sky/easter', { method: 'POST', body: '{}' }),
  markDiscoverySeen: () => request('/api/sky/discovery-seen', { method: 'POST', body: '{}' }),
  createInvite: () => request('/api/invites', { method: 'POST', body: '{}' }),
  readInvite: (token) => request(`/api/invites/${token}`),
  acceptInvite: (token) => request(`/api/invites/${token}/accept`, { method: 'POST', body: '{}' }),
};
