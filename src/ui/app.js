import { displayAuthor, ownerTypes, siteConfig, starColors, titleLines } from '../config.js';
import {
  buildShareUrl,
  clearInviteFromUrl,
  enterOwnSky,
  enterSharedSky,
  encodeSnapshot,
  getActiveSky,
  getSession,
  isHost,
  login,
  logout,
  parseInvite,
} from '../lib/session.js';
import {
  canEditStar,
  canRestStar,
  createStar,
  deleteStar,
  getRelations,
  getShareableStars,
  getStarById,
  getState,
  getVisibleStars,
  isSkyQuiet,
  markDiscovered,
  markDiscoverySeen,
  mergeSharedStars,
  releaseEasterEgg,
  updateStar,
} from '../lib/stars.js';
import { starVisuals, toPercent } from '../lib/position.js';
import { cloudDoodle, moonSvg, scribbleSvg, starSvg, tinyMoon } from './icons.js';

const OPENING_KEY = 'starry-together:opening-seen';

const app = document.querySelector('#app');
const overlayRoot = document.querySelector('#overlay-root');

let route = location.hash === '#sky' ? 'sky' : 'home';
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

export function startApp() {
  setTitle();
  bindViewport();
  if (getSession() && !getActiveSky()) enterOwnSky();
  acceptInviteIfNeeded();
  window.addEventListener('hashchange', () => {
    route = location.hash === '#sky' ? 'sky' : 'home';
    closeOverlay();
    render();
  });
  document.addEventListener('keydown', onGlobalKey);
  render();
}

function acceptInviteIfNeeded() {
  const invite = parseInvite();
  const session = getSession();
  if (!invite || !session) return;
  enterSharedSky(invite.hostId, invite.hostName);
  mergeSharedStars(invite.snapshot);
  clearInviteFromUrl();
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
        <form class="login-card" aria-labelledby="login-title">
        <h1 id="login-title" class="login-title">先留下一个称呼</h1>
        <p class="login-copy">${
          invite
            ? `有人把一片星空，分享给了你。<br>进来以后，主人就是${escapeHtml(invite.hostName)}。`
            : '不需要手机号，也不需要真实姓名。<br>一个称呼，就够走进这片星空。'
        }</p>
        <label class="field">
          <span>你想被怎么称呼？</span>
          <input name="name" maxlength="16" required placeholder="比如：晚风" autocomplete="nickname" />
        </label>
        <button class="btn btn-solid" type="submit" aria-label="进入这片星空">进入这片星空</button>
        </form>
      </div>
    </section>
  `;
  const form = app.querySelector('form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = String(new FormData(form).get('name') || '').trim();
    if (!login(name)) return;
    acceptInviteIfNeeded();
    sessionStorage.removeItem(OPENING_KEY);
    route = 'home';
    location.hash = '';
    render();
  });
}

function renderHome() {
  const openingSeen = sessionStorage.getItem(OPENING_KEY) === '1';
  const lines = titleLines();
  app.innerHTML = `
    <section class="view home sky-wash">
      <div class="home-dust"></div>
      <button class="opening${openingSeen ? ' is-gone' : ''}" type="button" data-opening aria-label="${escapeAttr(siteConfig.siteTitle)}，点一下进入">
        <span class="opening-moon" aria-hidden="true">${tinyMoon}</span>
        <span class="opening-title">
          <span class="opening-line">${escapeHtml(lines.first)}</span>
          ${lines.second ? `<span class="opening-rule" aria-hidden="true"></span><span class="opening-line">${escapeHtml(lines.second)}</span>` : ''}
        </span>
        <span class="opening-hint">轻轻点一下</span>
      </button>
      <div class="home-content${openingSeen ? '' : ' is-waiting'}">
        <div class="home-stage">
          ${moonSvg}
          <p class="home-line">${escapeHtml(siteConfig.heroLine)}</p>
          ${scribbleSvg}
          <p class="home-sub">${escapeHtml(siteConfig.heroSub)}</p>
          <p class="home-hint">${escapeHtml(siteConfig.heroHint)}</p>
          <button class="btn btn-solid" type="button" data-go-sky aria-label="去看看星空">
            ✨ 去看看
          </button>
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

function openShareModal() {
  const sky = getActiveSky();
  const host = isHost();
  const shareUrl = new URL(buildShareUrl());
  const packed = encodeSnapshot(getShareableStars());
  if (packed) shareUrl.searchParams.set('d', packed);
  const href = shareUrl.toString();
  const hostName = sky?.hostName || '一位朋友';

  showOverlay(`
    <div class="overlay" data-overlay>
      <div class="paper" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="paper-head">
          <h2 id="share-title">把这片星空，送给朋友</h2>
          <button class="btn btn-ghost close-paper" type="button" data-close aria-label="先收起来">先收起来</button>
        </div>
        <p class="star-card-body">
          ${
            host
              ? '发给微信里的一个人以后，你就是这片共享星空的主人。'
              : `这片星空的主人是 ${escapeHtml(hostName)}。<br>再转发给别人，主人也还是这个人。`
          }
        </p>
        <p class="share-link">${escapeHtml(href)}</p>
        <div class="form-actions">
          <button class="btn btn-solid" type="button" data-copy aria-label="复制星空的路">复制这一小段路</button>
          <button class="btn btn-ghost" type="button" data-native-share aria-label="发给微信好友">发给微信好友</button>
        </div>
        <button class="btn btn-ghost rest-action" type="button" data-switch aria-label="${host ? '换一个称呼' : '回到我的星空'}">
          ${host ? '换一个称呼' : '回到我的星空'}
        </button>
      </div>
    </div>
  `);

  overlayRoot.querySelector('[data-copy]')?.addEventListener('click', async (event) => {
    try {
      await navigator.clipboard.writeText(href);
      event.currentTarget.textContent = '已经抄下来了';
    } catch {
      window.prompt('把这段复制给微信好友', href);
    }
  });

  overlayRoot.querySelector('[data-native-share]')?.addEventListener('click', async () => {
    const text = host
      ? `我给你留了一片星空。\n${siteConfig.siteTitle}`
      : `${hostName}把一片星空，留给了我们。\n${siteConfig.siteTitle}`;
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

  overlayRoot.querySelector('[data-switch]')?.addEventListener('click', () => {
    if (host) {
      logout();
      closeOverlay();
      render();
      return;
    }
    enterOwnSky();
    closeOverlay();
    renderSky();
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

function openStarCard(id) {
  const { star, justUnlocked } = markDiscovered(id);
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

  form.addEventListener('submit', (event) => {
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
      updateStar(star.id, payload);
      sparkleStarId = star.id;
      closeOverlay();
      renderSky();
      window.setTimeout(() => {
        sparkleStarId = null;
      }, 900);
      return;
    }

    const created = createStar(payload);
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
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(restTimer);
    deleteStar(id);
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

  overlayRoot.querySelector('[data-next]')?.addEventListener('click', () => {
    if (step === 1) {
      openDiscoveryNotes(2);
      return;
    }
    markDiscoverySeen();
    releaseEasterEgg();
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

