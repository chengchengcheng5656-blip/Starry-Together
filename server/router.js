import { DEFAULT_RELATIONS, DEFAULT_STARS } from '../src/data/defaults.js';
import { id, loadDb, saveDb } from './store.js';

const COOKIE = 'starry_sid';

export function createRouter(env) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /auth/wechat') return startWechat(req, res, url, env);
    if (route === 'GET /auth/wechat/callback') return wechatCallback(req, res, url, env);
    if (route === 'POST /auth/wechat/local') return localWechat(req, res, env);
    if (route === 'GET /api/me') return me(req, res);
    if (route === 'POST /api/logout') return logout(req, res);
    if (route === 'GET /api/sky') return getSky(req, res);
    if (route === 'POST /api/stars') return createStar(req, res);
    if (route === 'POST /api/invites') return createInvite(req, res);

    const starPatch = url.pathname.match(/^\/api\/stars\/([^/]+)$/);
    if (starPatch && req.method === 'PATCH') return updateStar(req, res, starPatch[1]);

    const starRest = url.pathname.match(/^\/api\/stars\/([^/]+)\/rest$/);
    if (starRest && req.method === 'POST') return restStar(req, res, starRest[1]);

    const starDiscover = url.pathname.match(/^\/api\/stars\/([^/]+)\/discover$/);
    if (starDiscover && req.method === 'POST') return discoverStar(req, res, starDiscover[1]);

    if (route === 'POST /api/sky/easter') return releaseEaster(req, res);
    if (route === 'POST /api/sky/discovery-seen') return markDiscoverySeen(req, res);

    const inviteGet = url.pathname.match(/^\/api\/invites\/([^/]+)$/);
    if (inviteGet && req.method === 'GET') return readInvite(req, res, inviteGet[1]);

    const inviteAccept = url.pathname.match(/^\/api\/invites\/([^/]+)\/accept$/);
    if (inviteAccept && req.method === 'POST') return acceptInvite(req, res, inviteAccept[1]);

    return json(res, 404, { error: 'not_found' });
  };
}

function startWechat(req, res, url, env) {
  const appId = env.WECHAT_APP_ID;
  const redirect = env.WECHAT_REDIRECT_URI || `${url.origin}/auth/wechat/callback`;
  if (!appId) return json(res, 200, { mode: 'local' });
  const inWechat = /MicroMessenger/i.test(req.headers['user-agent'] || '');
  const authorize = inWechat
    ? 'https://open.weixin.qq.com/connect/oauth2/authorize'
    : 'https://open.weixin.qq.com/connect/qrconnect';
  const scope = inWechat ? 'snsapi_userinfo' : 'snsapi_login';
  const target = `${authorize}?appid=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${scope}&state=starry#wechat_redirect`;
  return json(res, 200, { mode: 'oauth', url: target });
}

async function wechatCallback(req, res, url, env) {
  const code = url.searchParams.get('code');
  if (!code || !env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    return redirect(res, '/');
  }
  const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`;
  const token = await fetch(tokenUrl).then((item) => item.json());
  if (!token.openid) return redirect(res, '/');
  const profile = await fetch(
    `https://api.weixin.qq.com/sns/userinfo?access_token=${token.access_token}&openid=${token.openid}&lang=zh_CN`,
  ).then((item) => item.json());
  const user = upsertUser({
    wechatOpenId: token.openid,
    name: profile.nickname || '微信用户',
    avatar: profile.headimgurl || '',
  });
  const sid = createSession(user.id);
  setCookie(res, sid);
  return redirect(res, '/');
}

async function localWechat(req, res, env) {
  if (env.WECHAT_APP_ID) return json(res, 400, { error: 'use_oauth' });
  const body = await readBody(req);
  const openId = String(body.wechatOpenId || '').slice(0, 80);
  if (!openId.startsWith('wx_')) return json(res, 400, { error: 'bad_openid' });
  const user = upsertUser({
    wechatOpenId: openId,
    name: String(body.name || '微信用户').slice(0, 16) || '微信用户',
    avatar: '',
  });
  const sid = createSession(user.id);
  setCookie(res, sid);
  return json(res, 200, { user: publicUser(user), sky: publicSky(ensureSky(user), user.id) });
}

function me(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 200, { user: null, sky: null });
  return json(res, 200, { user: publicUser(user), sky: publicSky(ensureSky(user), user.id) });
}

function logout(req, res) {
  const sid = cookie(req, COOKIE);
  const db = loadDb();
  db.sessions = db.sessions.filter((item) => item.id !== sid);
  saveDb(db);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
  return json(res, 200, { ok: true });
}

function getSky(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  return json(res, 200, { sky: publicSky(ensureSky(user), user.id) });
}

async function createStar(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  const body = await readBody(req);
  const star = {
    id: id('star'),
    name: String(body.name || '未命名的星星').slice(0, 24),
    content: String(body.content || '').slice(0, 280),
    author: body.ownerType === 'anonymous' ? '' : String(body.author || user.name || '').slice(0, 20),
    ownerType: body.ownerType || 'me',
    color: body.color || 'stardust',
    x: Number(body.x) || 0.5,
    y: Number(body.y) || 0.4,
    createdAt: new Date().toISOString(),
    discovered: true,
    isSpecial: false,
    isDefault: false,
    resting: false,
    createdLocally: true,
    createdBy: user.id,
  };
  sky.stars.push(star);
  saveSky(sky);
  return json(res, 200, { star, sky: publicSky(sky, user.id) });
}

async function updateStar(req, res, starId) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  const star = sky.stars.find((item) => item.id === starId);
  if (!star || star.createdBy !== user.id) return json(res, 403, { error: 'forbidden' });
  const body = await readBody(req);
  star.name = String(body.name ?? star.name).slice(0, 24);
  star.content = String(body.content ?? star.content).slice(0, 280);
  star.ownerType = body.ownerType || star.ownerType;
  star.color = body.color || star.color;
  star.author = star.ownerType === 'anonymous' ? '' : String(body.author ?? star.author).slice(0, 20);
  star.updatedAt = new Date().toISOString();
  saveSky(sky);
  return json(res, 200, { star, sky: publicSky(sky, user.id) });
}

function restStar(req, res, starId) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  const star = sky.stars.find((item) => item.id === starId);
  if (!star) return json(res, 404, { error: 'missing' });
  const host = sky.hostId === user.id;
  if (star.createdBy !== user.id && !(star.isDefault && host)) {
    return json(res, 403, { error: 'forbidden' });
  }
  star.resting = true;
  star.updatedAt = new Date().toISOString();
  saveSky(sky);
  return json(res, 200, { star, sky: publicSky(sky, user.id) });
}

function discoverStar(req, res, starId) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  const star = sky.stars.find((item) => item.id === starId);
  if (!star) return json(res, 404, { error: 'missing' });
  const firstTime = !star.discovered;
  star.discovered = true;
  const firstSix = sky.stars.filter((item) => item.defaultIndex >= 1 && item.defaultIndex <= 6);
  const unlocked = firstSix.every((item) => item.discovered);
  const justUnlocked = unlocked && !sky.awakened;
  if (unlocked) sky.awakened = true;
  saveSky(sky);
  return json(res, 200, { star, justUnlocked, sky: publicSky(sky, user.id) });
}

function releaseEaster(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  sky.easterReleased = true;
  saveSky(sky);
  return json(res, 200, { sky: publicSky(sky, user.id) });
}

function markDiscoverySeen(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  sky.discoverySeen = true;
  saveSky(sky);
  return json(res, 200, { sky: publicSky(sky, user.id) });
}

function createInvite(req, res) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const sky = ensureSky(user);
  const db = loadDb();
  const token = id('invite');
  db.invites.push({
    token,
    skyId: sky.id,
    hostId: sky.hostId,
    hostName: sky.hostName,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  return json(res, 200, {
    token,
    hostName: sky.hostName,
    path: `/?invite=${encodeURIComponent(token)}`,
  });
}

function readInvite(req, res, token) {
  const invite = loadDb().invites.find((item) => item.token === token);
  if (!invite) return json(res, 404, { error: 'missing' });
  const user = currentUser(req);
  const member = user && loadDb().members.some((item) => item.skyId === invite.skyId && item.userId === user.id);
  return json(res, 200, {
    token: invite.token,
    hostName: invite.hostName,
    hostId: invite.hostId,
    isMember: Boolean(member),
  });
}

function acceptInvite(req, res, token) {
  const user = currentUser(req);
  if (!user) return json(res, 401, { error: 'login' });
  const db = loadDb();
  const invite = db.invites.find((item) => item.token === token);
  if (!invite) return json(res, 404, { error: 'missing' });
  const exists = db.members.some((item) => item.skyId === invite.skyId && item.userId === user.id);
  if (!exists) {
    db.members.push({
      skyId: invite.skyId,
      userId: user.id,
      role: user.id === invite.hostId ? 'host' : 'guest',
      joinedAt: new Date().toISOString(),
    });
  }
  user.currentSkyId = invite.skyId;
  saveDb(db);
  const sky = db.skies.find((item) => item.id === invite.skyId);
  return json(res, 200, { sky: publicSky(sky, user.id) });
}

function upsertUser(profile) {
  const db = loadDb();
  let user = db.users.find((item) => item.wechatOpenId === profile.wechatOpenId);
  if (!user) {
    user = {
      id: id('user'),
      wechatOpenId: profile.wechatOpenId,
      name: profile.name,
      avatar: profile.avatar || '',
      currentSkyId: '',
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    saveDb(db);
    ensureSky(user);
    return user;
  }
  user.name = profile.name || user.name;
  user.avatar = profile.avatar || user.avatar;
  saveDb(db);
  return user;
}

function ensureSky(user) {
  const db = loadDb();
  let sky = null;
  if (user.currentSkyId) {
    sky = db.skies.find((item) => item.id === user.currentSkyId);
  }
  if (!sky) {
    const member = db.members.find((item) => item.userId === user.id);
    sky = member ? db.skies.find((item) => item.id === member.skyId) : null;
  }
  if (!sky) {
    sky = {
      id: id('sky'),
      hostId: user.id,
      hostName: user.name,
      stars: structuredClone(DEFAULT_STARS),
      relations: structuredClone(DEFAULT_RELATIONS),
      awakened: false,
      easterReleased: false,
      discoverySeen: false,
    };
    db.skies.push(sky);
    db.members.push({ skyId: sky.id, userId: user.id, role: 'host', joinedAt: new Date().toISOString() });
    user.currentSkyId = sky.id;
    const fresh = db.users.find((item) => item.id === user.id);
    if (fresh) fresh.currentSkyId = sky.id;
    saveDb(db);
    return sky;
  }
  if (user.currentSkyId !== sky.id) {
    user.currentSkyId = sky.id;
    const fresh = db.users.find((item) => item.id === user.id);
    if (fresh) fresh.currentSkyId = sky.id;
    saveDb(db);
  }
  return sky;
}

function saveSky(sky) {
  const db = loadDb();
  const index = db.skies.findIndex((item) => item.id === sky.id);
  if (index >= 0) db.skies[index] = sky;
  saveDb(db);
}

function createSession(userId) {
  const db = loadDb();
  const sid = id('sid');
  db.sessions.push({ id: sid, userId, createdAt: new Date().toISOString() });
  saveDb(db);
  return sid;
}

function currentUser(req) {
  const sid = cookie(req, COOKIE);
  if (!sid) return null;
  const db = loadDb();
  const session = db.sessions.find((item) => item.id === sid);
  if (!session) return null;
  return db.users.find((item) => item.id === session.userId) || null;
}

function publicUser(user) {
  return { id: user.id, name: user.name, avatar: user.avatar };
}

function publicSky(sky, userId) {
  if (!sky) return null;
  return {
    id: sky.id,
    hostId: sky.hostId,
    hostName: sky.hostName,
    isHost: sky.hostId === userId,
    stars: sky.stars,
    relations: sky.relations,
    awakened: sky.awakened,
    easterReleased: sky.easterReleased,
    discoverySeen: sky.discoverySeen,
  };
}

function cookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}

function setCookie(res, sid) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function redirect(res, to) {
  res.statusCode = 302;
  res.setHeader('Location', to);
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}
