import { DEFAULT_RELATIONS, DEFAULT_STARS, FIRST_SIX_IDS } from '../data/defaults.js';
import { findFreePosition } from './position.js';
import { api } from './api.js';
import { applyAuth, getSession, isHost } from './session.js';

let cache = null;

const emptyState = () => ({
  id: '',
  hostId: '',
  hostName: '',
  isHost: true,
  stars: structuredClone(DEFAULT_STARS),
  relations: structuredClone(DEFAULT_RELATIONS),
  awakened: false,
  easterReleased: false,
  discoverySeen: false,
});

function setCache(sky) {
  cache = sky ? structuredClone(sky) : emptyState();
  return cache;
}

export function getState() {
  return cache || emptyState();
}

export function getStars() {
  return getState().stars;
}

export function getVisibleStars() {
  const state = getState();
  return state.stars.filter((star) => {
    if (star.resting) return false;
    if (star.hiddenUntilUnlock && !state.easterReleased) return false;
    return true;
  });
}

export function getStarById(id) {
  return getState().stars.find((star) => star.id === id) || null;
}

export function getRelations() {
  const visibleIds = new Set(getVisibleStars().map((star) => star.id));
  return getState().relations.filter((link) => visibleIds.has(link.from) && visibleIds.has(link.to));
}

export function isSkyQuiet() {
  return getVisibleStars().length === 0;
}

export function canEditStar(star) {
  const session = getSession();
  return Boolean(star?.createdBy && session && star.createdBy === session.id);
}

export function canRestStar(star) {
  if (canEditStar(star)) return true;
  return Boolean(star?.isDefault && isHost());
}

export async function hydrateSky(sky) {
  if (sky) {
    applyAuth({ user: getSession(), sky });
    return setCache(sky);
  }
  const data = await api.sky();
  applyAuth({ user: getSession(), sky: data.sky });
  return setCache(data.sky);
}

export async function createStar(input) {
  const visible = getState().stars.filter((star) => !star.resting);
  const point = findFreePosition(visible);
  const data = await api.createStar({ ...input, x: point.x, y: point.y });
  setCache(data.sky);
  applyAuth({ user: getSession(), sky: data.sky });
  return data.star;
}

export async function updateStar(id, patch) {
  const data = await api.updateStar(id, patch);
  setCache(data.sky);
  return data.star;
}

export async function deleteStar(id) {
  const data = await api.restStar(id);
  setCache(data.sky);
  return data.star;
}

export async function markDiscovered(id) {
  const data = await api.discoverStar(id);
  setCache(data.sky);
  applyAuth({ user: getSession(), sky: data.sky });
  return { star: data.star, justUnlocked: Boolean(data.justUnlocked) };
}

export async function releaseEasterEgg() {
  const data = await api.releaseEaster();
  setCache(data.sky);
}

export async function markDiscoverySeen() {
  const data = await api.markDiscoverySeen();
  setCache(data.sky);
}

export { FIRST_SIX_IDS };
