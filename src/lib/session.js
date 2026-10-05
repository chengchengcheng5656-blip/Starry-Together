import { api } from './api.js';

const OPENID_KEY = 'starry-together:wechat-openid';

let session = null;
let skyMeta = null;
let waffo = { enabled: false, environment: 'test' };

export function getSession() {
  return session;
}

export function getActiveSky() {
  return skyMeta;
}

export function isHost() {
  return Boolean(session && skyMeta?.isHost);
}

export function getWaffo() {
  return waffo;
}

export function applyAuth(payload) {
  session = payload?.user || null;
  skyMeta = payload?.sky
    ? {
        id: payload.sky.id,
        hostId: payload.sky.hostId,
        hostName: payload.sky.hostName,
        isHost: payload.sky.isHost,
      }
    : null;
  if (payload?.waffo) waffo = payload.waffo;
  return { session, sky: payload?.sky || null };
}

export async function restoreSession() {
  try {
    const data = await api.me();
    applyAuth(data);
    return data;
  } catch {
    session = null;
    skyMeta = null;
    return { user: null, sky: null };
  }
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    /* keep going */
  }
  session = null;
  skyMeta = null;
}

export function getWechatOpenId() {
  let openId = localStorage.getItem(OPENID_KEY);
  if (!openId) {
    openId = `wx_${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    localStorage.setItem(OPENID_KEY, openId);
  }
  return openId;
}

export function resetWechatOpenId() {
  localStorage.removeItem(OPENID_KEY);
}

export function parseInvite() {
  const token = new URLSearchParams(location.search).get('invite');
  return token ? { token } : null;
}

export function clearInviteFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has('invite')) return;
  url.searchParams.delete('invite');
  history.replaceState({}, '', url);
}
