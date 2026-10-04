import { DEFAULT_RELATIONS, DEFAULT_STARS, FIRST_SIX_IDS } from '../data/defaults.js';
import { findFreePosition } from './position.js';
import { getActiveSky, getSession, isHost } from './session.js';

const LEGACY_KEY = 'starry-together:v1';
const SKY_PREFIX = 'starry-together:sky:';

const emptyState = () => ({
  version: 2,
  hostId: getActiveSky()?.hostId || '',
  hostName: getActiveSky()?.hostName || '',
  stars: structuredClone(DEFAULT_STARS),
  relations: structuredClone(DEFAULT_RELATIONS),
  awakened: false,
  easterReleased: false,
  discoverySeen: false,
});

function storageKey(hostId = getActiveSky()?.hostId) {
  return `${SKY_PREFIX}${hostId || 'local'}`;
}

function canUseStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readRaw() {
  if (!canUseStorage()) return emptyState();
  migrateLegacy();
  const raw = localStorage.getItem(storageKey());
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return emptyState();
  }
}

function migrateLegacy() {
  const session = getSession();
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy || !session) return;
  const ownKey = storageKey(session.id);
  if (!localStorage.getItem(ownKey)) {
    localStorage.setItem(ownKey, legacy);
  }
  localStorage.removeItem(LEGACY_KEY);
}

function migrate(parsed) {
  const next = emptyState();
  if (!parsed || typeof parsed !== 'object') return next;

  const storedStars = Array.isArray(parsed.stars) ? parsed.stars : [];
  const storedById = new Map(storedStars.map((star) => [star.id, star]));

  next.stars = DEFAULT_STARS.map((seed) => {
    const existing = storedById.get(seed.id);
    if (!existing) return structuredClone(seed);
    return normalizeStar({ ...seed, ...existing, id: seed.id, isDefault: true });
  });

  storedStars.forEach((star) => {
    if (!star?.id) return;
    if (DEFAULT_STARS.some((seed) => seed.id === star.id)) return;
    next.stars.push(normalizeStar(star));
  });

  next.relations = Array.isArray(parsed.relations)
    ? parsed.relations.filter((link) => link?.from && link?.to)
    : next.relations;
  next.awakened = Boolean(parsed.awakened);
  next.easterReleased = Boolean(parsed.easterReleased);
  next.discoverySeen = Boolean(parsed.discoverySeen);
  return next;
}

function normalizeStar(star) {
  return {
    id: String(star.id),
    name: String(star.name || '未命名的星星'),
    content: String(star.content || ''),
    author: String(star.author || ''),
    ownerType: star.ownerType || 'anonymous',
    color: star.color || 'stardust',
    x: clampCoord(star.x, 0.5),
    y: clampCoord(star.y, 0.4),
    createdAt: star.createdAt || new Date().toISOString(),
    discovered: Boolean(star.discovered),
    isSpecial: Boolean(star.isSpecial),
    isDefault: Boolean(star.isDefault),
    defaultIndex: star.defaultIndex ?? null,
    dimmed: Boolean(star.dimmed),
    isEasterEgg: Boolean(star.isEasterEgg),
    hiddenUntilUnlock: Boolean(star.hiddenUntilUnlock),
    resting: Boolean(star.resting),
    createdLocally: Boolean(star.createdLocally),
    createdBy: star.createdBy || '',
    updatedAt: star.updatedAt || null,
  };
}

function clampCoord(value, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(0.94, Math.max(0.06, number));
}

function writeState(state) {
  if (!canUseStorage()) return state;
  const sky = getActiveSky();
  state.hostId = sky?.hostId || state.hostId || '';
  state.hostName = sky?.hostName || state.hostName || '';
  localStorage.setItem(storageKey(state.hostId), JSON.stringify(state));
  return state;
}

function createId() {
  if (crypto?.randomUUID) return `star-${crypto.randomUUID()}`;
  return `star-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getState() {
  return readRaw();
}

export function getStars() {
  return getState().stars;
}

export function saveStars(stars) {
  const state = getState();
  state.stars = stars.map(normalizeStar);
  return writeState(state);
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

export function createStar(input) {
  const state = getState();
  const visible = state.stars.filter((star) => !star.resting);
  const point = findFreePosition(visible);
  const session = getSession();
  const star = normalizeStar({
    id: createId(),
    name: input.name,
    content: input.content,
    author: input.ownerType === 'anonymous' ? '' : (input.author || session?.name || ''),
    ownerType: input.ownerType,
    color: input.color,
    x: point.x,
    y: point.y,
    createdAt: new Date().toISOString(),
    discovered: true,
    createdLocally: true,
    createdBy: session?.id || '',
    hiddenUntilUnlock: false,
  });
  state.stars.push(star);
  writeState(state);
  return star;
}

export function updateStar(id, patch) {
  const state = getState();
  const index = state.stars.findIndex((star) => star.id === id);
  if (index === -1) return null;
  const current = state.stars[index];
  const next = normalizeStar({
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    createdLocally: current.createdLocally,
    isDefault: current.isDefault,
    defaultIndex: current.defaultIndex,
    isEasterEgg: current.isEasterEgg,
    hiddenUntilUnlock: current.hiddenUntilUnlock,
    dimmed: current.dimmed,
    isSpecial: current.isSpecial,
    x: current.x,
    y: current.y,
    author: (patch.ownerType || current.ownerType) === 'anonymous' ? '' : (patch.author ?? current.author),
    updatedAt: new Date().toISOString(),
  });
  state.stars[index] = next;
  writeState(state);
  return next;
}

export function deleteStar(id) {
  const state = getState();
  const index = state.stars.findIndex((star) => star.id === id);
  if (index === -1) return null;
  state.stars[index] = {
    ...state.stars[index],
    resting: true,
    updatedAt: new Date().toISOString(),
  };
  writeState(state);
  return state.stars[index];
}

export function markDiscovered(id) {
  const state = getState();
  const star = state.stars.find((item) => item.id === id);
  if (!star || star.discovered) {
    return { star, justUnlocked: false, alreadyAwakened: state.awakened };
  }
  star.discovered = true;
  const unlocked = hasFoundFirstSix(state.stars);
  const justUnlocked = unlocked && !state.awakened;
  if (unlocked) state.awakened = true;
  writeState(state);
  return { star, justUnlocked, alreadyAwakened: !justUnlocked && state.awakened };
}

export function releaseEasterEgg() {
  const state = getState();
  state.easterReleased = true;
  writeState(state);
}

export function hasFoundFirstSix(stars = getStars()) {
  return FIRST_SIX_IDS.every((id) => stars.find((star) => star.id === id)?.discovered);
}

export function getRelations() {
  const visibleIds = new Set(getVisibleStars().map((star) => star.id));
  return getState().relations.filter((link) => visibleIds.has(link.from) && visibleIds.has(link.to));
}

export function markDiscoverySeen() {
  const state = getState();
  state.discoverySeen = true;
  writeState(state);
}

export function canEditStar(star) {
  const session = getSession();
  if (star?.createdBy && session) return star.createdBy === session.id;
  return Boolean(star?.createdLocally && isHost());
}

export function canRestStar(star) {
  if (canEditStar(star)) return true;
  return Boolean(star?.isDefault && isHost());
}

export function mergeSharedStars(incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return getState();
  const state = getState();
  const ids = new Set(state.stars.map((star) => star.id));
  incoming.forEach((star) => {
    if (!star?.id || ids.has(star.id)) return;
    state.stars.push(normalizeStar(star));
    ids.add(star.id);
  });
  return writeState(state);
}

export function getShareableStars() {
  return getVisibleStars().filter((star) => !star.isDefault && !star.isEasterEgg);
}

export function isSkyQuiet() {
  return getVisibleStars().length === 0;
}

export { FIRST_SIX_IDS };
