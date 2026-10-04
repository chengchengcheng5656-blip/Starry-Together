const SESSION_KEY = 'starry-together:session';
const ACTIVE_SKY_KEY = 'starry-together:active-sky';

function canUseStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function createId() {
  if (crypto?.randomUUID) return `user-${crypto.randomUUID()}`;
  return `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getSession() {
  if (!canUseStorage()) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!parsed?.id || !parsed?.name) return null;
    return { id: String(parsed.id), name: String(parsed.name) };
  } catch {
    return null;
  }
}

export function login(name) {
  const trimmed = String(name || '').trim().slice(0, 16);
  if (!trimmed) return null;
  const current = getSession();
  const session = {
    id: current?.id || createId(),
    name: trimmed,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const invite = parseInvite();
  if (invite) {
    enterSharedSky(invite.hostId, invite.hostName);
  } else if (!getActiveSky() || getActiveSky().hostId === session.id) {
    enterOwnSky();
  }
  return session;
}

export function logout() {
  if (!canUseStorage()) return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ACTIVE_SKY_KEY);
}

export function getActiveSky() {
  if (!canUseStorage()) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_SKY_KEY) || 'null');
    if (!parsed?.hostId) return null;
    return {
      hostId: String(parsed.hostId),
      hostName: String(parsed.hostName || '一位朋友'),
    };
  } catch {
    return null;
  }
}

export function enterOwnSky() {
  const session = getSession();
  if (!session) return null;
  const sky = { hostId: session.id, hostName: session.name };
  localStorage.setItem(ACTIVE_SKY_KEY, JSON.stringify(sky));
  return sky;
}

export function enterSharedSky(hostId, hostName) {
  const session = getSession();
  const sky = {
    hostId: String(hostId),
    hostName: String(hostName || '一位朋友').slice(0, 16),
  };
  if (session && sky.hostId === session.id) {
    sky.hostName = session.name;
  }
  localStorage.setItem(ACTIVE_SKY_KEY, JSON.stringify(sky));
  return sky;
}

export function isHost() {
  const session = getSession();
  const sky = getActiveSky();
  return Boolean(session && sky && session.id === sky.hostId);
}

export function parseInvite() {
  const params = new URLSearchParams(location.search);
  const hostId = params.get('sky');
  if (!hostId) return null;
  const hostName = params.get('host') || '一位朋友';
  let snapshot = [];
  const packed = location.hash.startsWith('#d=') ? location.hash.slice(3) : params.get('d');
  if (packed) {
    snapshot = decodeSnapshot(packed);
  }
  return { hostId, hostName, snapshot };
}

export function clearInviteFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has('sky') && !url.hash.startsWith('#d=')) return;
  url.searchParams.delete('sky');
  url.searchParams.delete('host');
  url.searchParams.delete('d');
  if (url.hash.startsWith('#d=')) url.hash = '';
  history.replaceState({}, '', url);
}

export function encodeSnapshot(stars) {
  try {
    if (!stars?.length) return '';
    const compact = stars.map((star) => ({
      i: star.id,
      n: star.name,
      c: star.content,
      a: star.author,
      o: star.ownerType,
      k: star.color,
      x: star.x,
      y: star.y,
      t: star.createdAt,
      b: star.createdBy || '',
    }));
    const json = JSON.stringify(compact);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    if (encoded.length > 1600) return '';
    return encoded;
  } catch {
    return '';
  }
}

export function decodeSnapshot(packed) {
  try {
    const json = decodeURIComponent(escape(atob(packed)));
    const rows = JSON.parse(json);
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => ({
      id: row.i,
      name: row.n,
      content: row.c,
      author: row.a || '',
      ownerType: row.o || 'anonymous',
      color: row.k || 'stardust',
      x: row.x,
      y: row.y,
      createdAt: row.t,
      createdBy: row.b || '',
      createdLocally: false,
      discovered: true,
      resting: false,
      isDefault: false,
    }));
  } catch {
    return [];
  }
}

export function buildShareUrl() {
  const sky = getActiveSky();
  const session = getSession();
  if (!sky) return location.origin + location.pathname;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('sky', sky.hostId);
  url.searchParams.set('host', sky.hostName || session?.name || '一位朋友');
  return url.toString();
}
