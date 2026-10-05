import { displayAuthor, ownerTypes, siteConfig, starColors, titleLines } from '../config.js';
import { api } from '../lib/api.js';
import {
  applyAuth,
  clearInviteFromUrl,
  getActiveSky,
  getSession,
  getWaffo,
  getWechatOpenId,
  isHost,
  logout,
  parseInvite,
  resetWechatOpenId,
  restoreSession,
} from '../lib/session.js';
import {
  canEditStar,
  canRestStar,
  createStar,
  deleteStar,
  getRelations,
  getStarById,
  getState,
  getVisibleStars,
  hydrateSky,
  isSkyQuiet,
  markDiscovered,
  markDiscoverySeen,
  releaseEasterEgg,
  updateStar,
} from '../lib/stars.js';
import { starVisuals, toPercent } from '../lib/position.js';
import { cloudDoodle, moonSvg, scribbleSvg, starSvg, tapSpark, tinyMoon, wechatSvg } from './icons.js';

const OPENING_KEY = 'starry-together:opening-seen';

const app = document.querySelector('#app');
const overlayRoot = document.querySelector('#overlay-root');

let route = currentRoute();
let enteringStarId = null;
let sparkleStarId = null;
let leavingStarId = null;
let flyInEaster = false;
let lastFocus = null;
let pendingDiscovery = false;
let restTimer = 0;

function setTitle() {
  document.title = siteConfig.siteTitle;
}

export async function startApp() {
  setTitle();
  bindViewport();
  await restoreSession();
  if (getSession()) {
    try {
      await hydrateSky();
    } catch {
      /* login screen if sky cannot load */
    }
  }
  window.addEventListener('hashchange', () => {
    route = currentRoute();
    closeOverlay();
    render();
    maybeShowGiftReturn();
  });
  document.addEventListener('keydown', onGlobalKey);
  render();
  maybeShowGiftReturn();
}

function bindViewport() {
  const sync = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--vvh', `${height}px`);
  };
  sync();
  window.visualViewport?.addEventListener('resize', sync);
  window.addEventListener('resize', sync);
}

function render() {
  if (!getSession()) {
    renderLogin();
    return;
  }
  if (parseInvite()) {
    renderInvite();
    return;
  }
  if (route === 'home') {
    renderHome();
    return;
  }
  renderSky();
  maybeShowDiscovery();
}

function renderLogin() {
  const invite = parseInvite();
  app.innerHTML = `
    <section class="view home sky-wash login">
      <div class="home-dust"></div>
      <div class="login-stage">
        ${moonSvg}
        <div class="login-card" aria-labelledby="login-title">
          <h1 id="login-title" class="login-title">用微信走进这片星空</h1>
          <p class="login-copy">${
            invite
              ? '有人把一片星空，邀请你一起写下。<br>先用微信登录，再决定要不要接受。'
              : '用微信账号登录以后，星星会一直为你存着。<br>除非你让它休息，否则下次进来还在。'
          }</p>
          <button class="btn wechat-btn" type="button" data-wechat aria-label="微信登录">
            ${wechatSvg}
            <span>微信登录</span>
          </button>
          <button class="btn btn-ghost rest-action" type="button" data-switch-wx aria-label="换一个微信账号">
            这不是你的微信？
          </button>
        </div>
      </div>
    </section>
  `;
  app.querySelector('[data-wechat]')?.addEventListener('click', startWechatLogin);
  app.querySelector('[data-switch-wx]')?.addEventListener('click', () => {
    resetWechatOpenId();
    startWechatLogin();
  });
}

async function startWechatLogin() {
  const button = app.querySelector('[data-wechat]');
  if (button) button.disabled = true;
  try {
    const start = await api.startWechat();
    if (start.mode === 'oauth' && start.url) {
      location.href = start.url;
      return;
    }
    const data = await api.localWechat({
      wechatOpenId: getWechatOpenId(),
      name: '微信用户',
    });
    applyAuth(data);
    await hydrateSky(data.sky);
    sessionStorage.removeItem(OPENING_KEY);
    render();
  } catch (error) {
    console.error(error);
    if (button) button.disabled = false;
  }
}

async function renderInvite() {
  const { token } = parseInvite();
  let info = { hostName: '一位朋友', isMember: false };
  try {
    info = await api.readInvite(token);
  } catch {
    app.innerHTML = `
      <section class="view home sky-wash login">
        <div class="login-card">
          <h1 class="login-title">这封邀请已经找不到了</h1>
          <button class="btn btn-solid" type="button" data-home>回到自己的星空</button>
        </div>
      </section>
    `;
    app.querySelector('[data-home]')?.addEventListener('click', () => {
      clearInviteFromUrl();
      render();
    });
    return;
  }

  if (info.isMember) {
    clearInviteFromUrl();
    render();
    return;
  }

  app.innerHTML = `
    <section class="view home sky-wash login">
      <div class="home-dust"></div>
      <div class="login-stage">
        ${moonSvg}
        <div class="login-card" aria-labelledby="invite-title">
          <h1 id="invite-title" class="login-title">接受这片星空的邀请</h1>
          <p class="login-copy">
            ${escapeHtml(info.hostName)} 把一片星空，递给了你。<br>
            点下接受以后，你们会共享同一片星空。<br>
            写下的星星会一直存着，除非有人让它休息。
          </p>
          <button class="btn btn-solid" type="button" data-accept aria-label="接受邀请">
            接受邀请
          </button>
        </div>
      </div>
    </section>
  `;
  app.querySelector('[data-accept]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      const data = await api.acceptInvite(token);
      applyAuth({ user: getSession(), sky: data.sky });
      await hydrateSky(data.sky);
      clearInviteFromUrl();
      sessionStorage.removeItem(OPENING_KEY);
      route = 'home';
      render();
    } catch {
      event.currentTarget.disabled = false;
    }
  });
}

function renderHome() {
  const openingSeen = sessionStorage.getItem(OPENING_KEY) === '1';
  const lines = titleLines();
  app.innerHTML = `
    <section class="view home sky-wash">
      <div class="home-dust"></div>
      <button class="opening${openingSeen ? ' is-gone' : ''}" type="button" data-opening aria-label="${escapeAttr(lines.first)} ${escapeAttr(lines.second)}，轻点进入">
        <span class="opening-moon" aria-hidden="true">${tinyMoon}</span>
        <span class="opening-title">
          <span class="opening-line">${escapeHtml(lines.first)}</span>
          ${lines.second ? `<span class="opening-rule" aria-hidden="true"></span><span class="opening-line">${escapeHtml(lines.second)}</span>` : ''}
        </span>
        <span class="opening-hint" aria-hidden="true">
          <span class="tap-cue">
            <span class="tap-ripple"></span>
            <span class="tap-ripple tap-ripple-late"></span>
            <span class="tap-glow"></span>
            <span class="tap-spark">${tapSpark}</span>
          </span>
        </span>
      </button>
      <div class="home-content${openingSeen ? '' : ' is-waiting'}">
        <div class="home-stage">
          ${moonSvg}
          <p class="home-line">${escapeHtml(siteConfig.heroLine)}</p>
          ${scribbleSvg}
          <p class="home-sub">${escapeHtml(siteConfig.heroSub)}</p>
          <p class="home-hint">${escapeHtml(siteConfig.heroHint)}</p>
          <div class="home-actions">
            <button class="btn btn-solid" type="button" data-go-sky aria-label="去看看星空">
              ✨ 去看看
            </button>
            <button class="btn btn-gift" type="button" data-gift aria-label="${escapeAttr(siteConfig.giftLine)}">
              ${escapeHtml(siteConfig.giftLine)}
            </button>
          </div>
        </div>
        <div class="home-whispers">
          <p>${escapeHtml(siteConfig.whisperA)}</p>
          <p>${escapeHtml(siteConfig.whisperB)}</p>
        </div>
      </div>
    </section>
  `;
  app.querySelector('[data-opening]')?.addEventListener('click', dismissOpening);
  app.querySelector('[data-go-sky]')?.addEventListener('click', goSky);
  app.querySelector('[data-gift]')?.addEventListener('click', (event) => startGiftCheckout(event.currentTarget));
}

function dismissOpening() {
  const opening = app.querySelector('[data-opening]');
  const content = app.querySelector('.home-content');
  if (!opening || opening.classList.contains('is-gone')) return;
  opening.classList.add('is-leaving');
  content?.classList.remove('is-waiting');
  opening.addEventListener(
    'animationend',
    () => {
      opening.classList.add('is-gone');
      sessionStorage.setItem(OPENING_KEY, '1');
    },
    { once: true },
  );
  window.setTimeout(() => {
    opening.classList.add('is-gone');
    sessionStorage.setItem(OPENING_KEY, '1');
  }, 900);
}

function renderSky() {
  const state = getState();
  const stars = getVisibleStars();
  const quiet = isSkyQuiet();
  const awakenedClass = state.awakened ? ' is-awakened' : '';
  const sky = getActiveSky();
  const hostLabel = isHost() ? '你的星空' : `${sky?.hostName || '朋友'}的星空`;

  app.innerHTML = `
    <section class="view sky sky-wash${awakenedClass}">
      <div class="sky-dust"></div>
      <div class="sky-veil"></div>
      <header class="sky-top">
        <p class="sky-brand">${escapeHtml(hostLabel)}</p>
        <div class="sky-actions">
          <button class="sky-link" type="button" data-gift aria-label="${escapeAttr(siteConfig.giftLine)}">
            ${escapeHtml(siteConfig.giftLine)}
          </button>
          <button class="sky-link" type="button" data-share aria-label="把这片星空送给朋友">
            送给朋友
          </button>
          <button class="sky-link" type="button" data-go-home aria-label="回到封面">
            封面
          </button>
        </div>
      </header>
      ${quiet ? renderEmpty() : ''}
      <svg class="constellation" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${renderRelations()}
      </svg>
      <div class="star-layer">${stars.map(renderStar).join('')}</div>
      <button class="btn btn-solid write-star" type="button" data-write aria-label="写一颗星星">
        ＋ 写一颗星星
      </button>
    </section>
  `;

  app.querySelector('[data-go-home]')?.addEventListener('click', goHome);
  app.querySelector('[data-share]')?.addEventListener('click', openShareModal);
  app.querySelector('[data-gift]')?.addEventListener('click', (event) => startGiftCheckout(event.currentTarget));
  app.querySelector('[data-write]')?.addEventListener('click', () => openWriteModal());
  app.querySelector('[data-empty-write]')?.addEventListener('click', () => openWriteModal());
  app.querySelectorAll('.star-hit').forEach((button) => {
    button.addEventListener('click', () => openStarCard(button.dataset.id));
    button.addEventListener('animationend', (event) => {
      if (event.animationName === 'easter-fly') flyInEaster = false;
      if (event.animationName === 'star-enter') enteringStarId = null;
    });
  });

}

function renderEmpty() {
  return `
    <div class="empty-sky">
      <h2>今晚的天空有点安静。</h2>
      <p>要不要写一颗新的星星？</p>
      <button class="btn btn-solid" type="button" data-empty-write aria-label="写一颗星星">
        ✨ 写一颗星星
      </button>
    </div>
  `;
}

function renderRelations() {
  return getRelations()
    .map((link) => {
      const from = getStarById(link.from);
      const to = getStarById(link.to);
      if (!from || !to) return '';
      return `<path d="M ${from.x * 100} ${from.y * 100} C ${from.x * 100 + 6} ${from.y * 100 + 4}, ${to.x * 100 - 6} ${to.y * 100 - 3}, ${to.x * 100} ${to.y * 100}" />`;
    })
    .join('');
}

function renderStar(star) {
  const visuals = starVisuals(star);
  const color = `var(--${star.color})`;
  const classes = [
    'star-hit',
    star.ownerType === 'us' ? 'is-us' : '',
    star.dimmed ? 'is-dimmed' : '',
    star.id === enteringStarId ? 'is-entering' : '',
    star.id === sparkleStarId ? 'sparkle' : '',
    star.id === leavingStarId ? 'is-leaving' : '',
    star.isEasterEgg && flyInEaster ? 'is-easter' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <button
      class="${classes}"
      type="button"
      data-id="${star.id}"
      data-size="${visuals.size}"
      style="left:${toPercent(star.x)};top:${toPercent(star.y)};--star-color:${color};--star-brightness:${visuals.brightness};--twinkle-duration:${visuals.twinkleDuration};--twinkle-delay:${visuals.twinkleDelay};--float-duration:${visuals.floatDuration};--float-delay:${visuals.floatDelay};--drift-x:${visuals.driftX};--drift-y:${visuals.driftY};"
      aria-label="星星：${escapeAttr(star.name)}"
    >
      <span class="star-visual">${starSvg}</span>
      <span class="star-name-hint">${escapeHtml(star.name)}</span>
    </button>
  `;
}

function goSky() {
  location.hash = 'sky';
}

async function startGiftCheckout(button) {
  if (button) button.disabled = true;
  try {
    const data = await api.createCheckout();
    const opened = window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');
    if (!opened && data.checkoutUrl) {
      showGiftNotice('请允许弹出窗口，再轻轻点一次。');
    }
  } catch (error) {
    const configured = getWaffo()?.enabled;
    const message = !configured || error.status === 503
      ? '收款还没接上。把私钥写进 .env 的 WAFFO_PRIVATE_KEY，然后重新启动。'
      : error.data?.message || '这一次没有走出去，稍后再试试。';
    showGiftNotice(message);
  } finally {
    if (button) button.disabled = false;
  }
}

function showGiftNotice(message) {
  showOverlay(`
    <div class="overlay" data-overlay>
      <div class="paper" role="dialog" aria-modal="true" aria-labelledby="gift-title">
        <div class="paper-head">
          <h2 id="gift-title">${escapeHtml(siteConfig.giftLine)}</h2>
          <button class="btn btn-ghost close-paper" type="button" data-close aria-label="先收起来">先收起来</button>
        </div>
        <p class="star-card-body">${escapeHtml(message)}</p>
      </div>
    </div>
  `);
}

function currentRoute() {
  return hashPath() === 'sky' ? 'sky' : 'home';
}

function hashPath() {
  return location.hash.replace(/^#/, '').split('?')[0];
}

function hashParams() {
  const hash = location.hash.replace(/^#/, '');
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

function hasGiftReturn() {
  return hashParams().get('gift') === '1' || new URLSearchParams(location.search).get('gift') === '1';
}

function clearGiftReturn() {
  const path = hashPath();
  const url = new URL(location.href);
  url.searchParams.delete('gift');
  url.hash = path ? `#${path}` : '';
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function maybeShowGiftReturn() {
  if (!hasGiftReturn()) return;
  clearGiftReturn();
  route = 'sky';
  try {
    await hydrateSky();
  } catch {
    /* sky may not have the gift star yet */
  }
  render();
  showGiftNotice('这颗星星正在亮起来。如果还没看见，稍等一会儿再回来看看。');
  pollGiftStar();
}

async function pollGiftStar() {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 1600));
    try {
      const state = await hydrateSky();
      if (state?.stars?.some((star) => star.isGift && !star.resting)) {
        render();
        return;
      }
    } catch {
      /* keep waiting for the webhook */
    }
  }
}

async function openShareModal() {
  const sky = getActiveSky();
  const host = isHost();
  const hostName = sky?.hostName || '一位朋友';
  let href = location.origin + '/';
  try {
    const invite = await api.createInvite();
    href = new URL(invite.path, location.origin).toString();
  } catch {
    /* keep fallback */
  }

  showOverlay(`
    <div class="overlay" data-overlay>
      <div class="paper" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="paper-head">
          <h2 id="share-title">邀请朋友来这片星空</h2>
          <button class="btn btn-ghost close-paper" type="button" data-close aria-label="先收起来">先收起来</button>
        </div>
        <p class="star-card-body">
          ${
            host
              ? '发给微信里的一个人。对方登录微信后，会看到「接受邀请」。接受以后，你们就共享这一片星空。'
              : `这片星空的主人是 ${escapeHtml(hostName)}。再发给别人，主人也还是这个人。`
          }
        </p>
        <p class="share-link">${escapeHtml(href)}</p>
        <div class="form-actions">
          <button class="btn btn-solid" type="button" data-copy aria-label="复制邀请">复制邀请</button>
          <button class="btn btn-ghost" type="button" data-native-share aria-label="发给微信好友">发给微信好友</button>
        </div>
        <button class="btn btn-ghost rest-action" type="button" data-logout aria-label="退出微信登录">
          退出微信登录
        </button>
      </div>
    </div>
  `);

  overlayRoot.querySelector('[data-copy]')?.addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(href);
      event.currentTarget.textContent = '已经抄下来了';
    } catch {
      window.prompt('把这段发给微信好友', href);
    }
  });

  overlayRoot.querySelector('[data-native-share]')?.addEventListener('click', async () => {
    const text = `${hostName}邀请你，一起来写一片星空。\n接受邀请后，星星会一直存着。`;
    if (navigator.share) {
      try {
        await navigator.share({ title: siteConfig.siteTitle, text, url: href });
        return;
      } catch {
        /* user dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${href}`);
    } catch {
      window.prompt('把这段发给微信好友', `${text}\n${href}`);
    }
  });

  overlayRoot.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await logout();
    closeOverlay();
    render();
  });
}

function goHome() {
  sessionStorage.removeItem(OPENING_KEY);
  if (location.hash) {
    location.hash = '';
    return;
  }
  route = 'home';
  render();
}

async function openStarCard(id) {
  const { star, justUnlocked } = await markDiscovered(id);
  if (!star || star.resting) return;
  const date = formatDate(star.createdAt);
  const editable = canEditStar(star);
  const restable = canRestStar(star);
  showOverlay(`
    <div class="overlay" data-overlay>
      <article class="paper" role="dialog" aria-modal="true" aria-labelledby="star-card-title">
        <div class="doodle-row">${cloudDoodle}${tinyMoon}</div>
        <div class="paper-head">
          <h2 class="star-card-name" id="star-card-title">${escapeHtml(star.name)}</h2>
          <button class="btn btn-ghost close-paper" type="button" data-close aria-label="先收起来">先收起来</button>
        </div>
        <p class="star-card-body">${escapeHtml(star.content)}</p>
        <p class="meta">
          <span>${escapeHtml(displayAuthor(star))}</span>
          <span>${escapeHtml(date)}</span>
        </p>
        <div class="card-actions">
          ${
            editable
              ? `<button class="btn btn-solid" type="button" data-edit aria-label="修改这颗星星">🖍️ 修改这颗星星</button>`
              : ''
          }
          ${
            restable
              ? `<button class="btn btn-ghost rest-action" type="button" data-rest aria-label="让它休息一下">🌙 让它休息一下</button>`
              : ''
          }
        </div>
      </article>
    </div>
  `);

  overlayRoot.querySelector('[data-edit]')?.addEventListener('click', () => openWriteModal(star));
  overlayRoot.querySelector('[data-rest]')?.addEventListener('click', () => openRestConfirm(star));

  if (justUnlocked || (getState().awakened && !getState().discoverySeen)) {
    pendingDiscovery = true;
  }
}

function openWriteModal(star = null) {
  const editing = Boolean(star);
  const draft = {
    name: star?.name || '',
    content: star?.content || '',
    author: star?.author || getSession()?.name || '',
    ownerType: star?.ownerType || 'me',
    color: star?.color || 'stardust',
  };

  showOverlay(`
    <div class="overlay" data-overlay>
      <form class="paper" role="dialog" aria-modal="true" aria-labelledby="write-title">
        <div class="paper-head">
          <h2 id="write-title">${editing ? '想把这颗星星改成什么样？' : '想把什么留在星空里？'}</h2>
          <button class="btn btn-ghost close-paper" type="button" data-close aria-label="先收起来">先收起来</button>
        </div>
        <label class="field">
          <span>星星名字</span>
          <input name="name" maxlength="24" required value="${escapeAttr(draft.name)}" placeholder="今天的晚风" />
        </label>
        <label class="field">
          <span>星星内容</span>
          <textarea name="content" maxlength="280" required placeholder="今天下班的时候，风很温柔。">${escapeHtml(draft.content)}</textarea>
        </label>
        <div class="field">
          <span>这颗星星属于谁？</span>
          <div class="choices" data-owners>
            ${ownerTypes
              .map(
                (item) => `
              <button class="choice${item.id === draft.ownerType ? ' is-on' : ''}" type="button" data-owner="${item.id}" aria-pressed="${item.id === draft.ownerType}">
                ${item.emoji} ${item.label}
              </button>`,
              )
              .join('')}
          </div>
        </div>
        <label class="field" data-author-field>
          <span>想署个名字吗？可以留空。</span>
          <input name="author" maxlength="20" value="${escapeAttr(draft.author)}" placeholder="一个路过的人" />
        </label>
        <div class="field">
          <span>星星颜色</span>
          <div class="choices" data-colors>
            ${starColors
              .map(
                (item) => `
              <button class="choice${item.id === draft.color ? ' is-on' : ''}" type="button" data-color="${item.id}" aria-pressed="${item.id === draft.color}">
                <i class="color-dot" style="--swatch:${item.hex}"></i>${item.emoji} ${item.label}
              </button>`,
              )
              .join('')}
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-solid" type="submit" aria-label="把它放进星空">把它放进星空 ✨</button>
        </div>
        <input type="hidden" name="ownerType" value="${draft.ownerType}" />
        <input type="hidden" name="color" value="${draft.color}" />
      </form>
    </div>
  `);

  const form = overlayRoot.querySelector('form');
  const ownerInput = form.querySelector('[name="ownerType"]');
  const colorInput = form.querySelector('[name="color"]');
  const authorField = form.querySelector('[data-author-field]');

  const syncAuthorField = () => {
    authorField.hidden = ownerInput.value === 'anonymous';
  };
  syncAuthorField();

  form.querySelectorAll('[data-owner]').forEach((button) => {
    button.addEventListener('click', () => {
      ownerInput.value = button.dataset.owner;
      form.querySelectorAll('[data-owner]').forEach((item) => {
        item.classList.toggle('is-on', item === button);
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
      syncAuthorField();
    });
  });

  form.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      colorInput.value = button.dataset.color;
      form.querySelectorAll('[data-color]').forEach((item) => {
        item.classList.toggle('is-on', item === button);
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') || '').trim(),
      content: String(data.get('content') || '').trim(),
      author: String(data.get('author') || '').trim(),
      ownerType: String(data.get('ownerType')),
      color: String(data.get('color')),
    };
    if (!payload.name || !payload.content) return;

    if (editing) {
      await updateStar(star.id, payload);
      sparkleStarId = star.id;
      closeOverlay();
      renderSky();
      window.setTimeout(() => {
        sparkleStarId = null;
      }, 900);
      return;
    }

    const created = await createStar(payload);
    enteringStarId = created.id;
    closeOverlay();
    renderSky();
  });
}

function openRestConfirm(star) {
  showOverlay(`
    <div class="overlay" data-overlay>
      <div class="paper" role="dialog" aria-modal="true" aria-labelledby="rest-title">
        <h2 id="rest-title">确定要让它暂时离开星空吗？</h2>
        <p class="star-card-body">它还可以被留下。休息只是今晚先不看它。</p>
        <div class="confirm-actions">
          <button class="btn btn-solid" type="button" data-keep aria-label="留下它">留下它</button>
          <button class="btn btn-ghost rest-action" type="button" data-confirm-rest aria-label="让它休息">让它休息</button>
        </div>
      </div>
    </div>
  `);

  overlayRoot.querySelector('[data-keep]')?.addEventListener('click', () => openStarCard(star.id));
  overlayRoot.querySelector('[data-confirm-rest]')?.addEventListener('click', () => restStar(star.id));
}

function restStar(id) {
  pendingDiscovery = false;
  leavingStarId = id;
  closeOverlay();
  renderSky();
  const node = app.querySelector(`[data-id="${CSS.escape(id)}"]`);
  let done = false;
  const finish = async () => {
    if (done) return;
    done = true;
    window.clearTimeout(restTimer);
    await deleteStar(id);
    leavingStarId = null;
    render();
  };
  if (!node) {
    finish();
    return;
  }
  node.addEventListener('animationend', finish, { once: true });
  restTimer = window.setTimeout(finish, 1300);
}

function openDiscoveryNotes(step = 1) {
  const first = `
    <p>原来我们的星星已经有这么多了。</p>
    <p>这里的我们，是所有来到这里的人。</p>
  `;
  const second = `
    <p>至于下一颗星星会写什么……</p>
    <p>我不知道。</p>
    <p>等你来一起写。🌙</p>
  `;

  showOverlay(`
    <div class="overlay note" data-overlay data-lock>
      <div class="paper" role="dialog" aria-modal="true" aria-labelledby="note-title">
        <h2 id="note-title">${step === 1 ? '天空亮了一点' : '以后'}</h2>
        ${step === 1 ? first : second}
        <div class="form-actions">
          <button class="btn btn-solid" type="button" data-next aria-label="${step === 1 ? '继续看看' : '我知道了'}">
            ${step === 1 ? '继续看看' : '我知道了'}
          </button>
        </div>
      </div>
    </div>
  `);

  overlayRoot.querySelector('[data-next]')?.addEventListener('click', async () => {
    if (step === 1) {
      openDiscoveryNotes(2);
      return;
    }
    await markDiscoverySeen();
    await releaseEasterEgg();
    flyInEaster = true;
    closeOverlay();
    renderSky();
  });
}

function showOverlay(html) {
  lastFocus = document.activeElement;
  document.body.classList.add('is-locked');
  overlayRoot.innerHTML = html;
  overlayRoot.querySelector('[data-close]')?.addEventListener('click', closeOverlay);
  overlayRoot.querySelector('[data-overlay]')?.addEventListener('click', (event) => {
    if (event.target.dataset.overlay === undefined) return;
    if (event.target.dataset.lock !== undefined) return;
    closeOverlay();
  });
  const dialog = overlayRoot.querySelector('[role="dialog"]');
  const focusable = dialog?.querySelector('button, input, textarea');
  focusable?.focus();
}

function closeOverlay() {
  overlayRoot.innerHTML = '';
  document.body.classList.remove('is-locked');
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus();
  }
  if (pendingDiscovery && route === 'sky') {
    pendingDiscovery = false;
    render();
  }
}

function maybeShowDiscovery() {
  const state = getState();
  if (route !== 'sky' || overlayRoot.innerHTML) return;
  if (state.awakened && !state.easterReleased) {
    openDiscoveryNotes();
  }
}

function onGlobalKey(event) {
  if (event.key === 'Escape' && overlayRoot.innerHTML) {
    if (overlayRoot.querySelector('[data-lock]')) return;
    closeOverlay();
  }
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

