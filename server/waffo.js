import { WaffoPancake, WaffoPancakeError, verifyWebhook } from '@waffo/pancake-ts';
import { findFreePosition } from '../src/lib/position.js';
import { id, loadDb, saveDb } from './store.js';

const GIFT_SKU = 'starry-gift-star';
const GIFT_NAME = '一颗专属星星';

let client = null;
let clientKey = '';

export function isWaffoConfigured(env) {
  const merchantId = String(env?.WAFFO_MERCHANT_ID || '').trim();
  const privateKey = String(env?.WAFFO_PRIVATE_KEY || '').trim();
  if (!merchantId.startsWith('MER_')) return false;
  if (!privateKey || privateKey.includes('paste-your-private-key')) return false;
  return privateKey.length > 40;
}

export function waffoStatus(env) {
  return {
    enabled: isWaffoConfigured(env),
    environment: env?.WAFFO_ENVIRONMENT || 'test',
  };
}

export function getWaffoClient(env) {
  if (!isWaffoConfigured(env)) {
    const error = new Error('waffo_not_configured');
    error.code = 'waffo_not_configured';
    throw error;
  }
  const key = `${env.WAFFO_MERCHANT_ID}:${env.WAFFO_ENVIRONMENT || 'test'}`;
  if (!client || clientKey !== key) {
    client = new WaffoPancake({
      merchantId: env.WAFFO_MERCHANT_ID,
      privateKey: env.WAFFO_PRIVATE_KEY,
      environment: env.WAFFO_ENVIRONMENT || 'test',
    });
    clientKey = key;
  }
  return client;
}

export async function ensureGiftProduct(env) {
  if (env.WAFFO_PRODUCT_ID) return env.WAFFO_PRODUCT_ID;
  const db = loadDb();
  if (db.waffo?.productId) return db.waffo.productId;

  const pancake = getWaffoClient(env);
  const storeId = String(env.WAFFO_STORE_ID || '').trim();
  if (!storeId) {
    const error = new Error('waffo_store_missing');
    error.code = 'waffo_store_missing';
    throw error;
  }

  try {
    const listed = await pancake.graphql.query({
      query: `query ($id: String!) {
        store(id: $id) {
          id
          onetimeProducts { id name status }
        }
      }`,
      variables: { id: storeId },
    });
    const existing = listed.data?.store?.onetimeProducts?.find((item) => item.name === GIFT_NAME);
    if (existing?.id) {
      saveProductId(existing.id);
      return existing.id;
    }
  } catch {
    /* create a new gift product if the store query is unavailable */
  }

  const { product } = await pancake.onetimeProducts.create({
    storeId,
    name: GIFT_NAME,
    description: '把一颗星星，真正留在这片天上。',
    prices: {
      USD: { amount: '0.99', taxIncluded: true, taxCategory: 'digital_goods' },
    },
    metadata: { sku: GIFT_SKU },
  });
  saveProductId(product.id);
  return product.id;
}

export async function createGiftCheckout(env, { user, sky, origin }) {
  const pancake = getWaffoClient(env);
  const productId = await ensureGiftProduct(env);
  const session = await pancake.checkout.authenticated.create({
    productId,
    currency: env.WAFFO_CURRENCY || 'USD',
    buyerIdentity: user.id,
    successUrl: `${origin}/#sky?gift=1`,
    darkMode: true,
    language: 'zh-Hans',
    metadata: {
      userId: user.id,
      skyId: sky.id,
      sku: GIFT_SKU,
    },
    orderMerchantExternalId: `starry-${sky.id}-${Date.now()}`.slice(0, 128),
  });
  return {
    checkoutUrl: session.checkoutUrl,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  };
}

export function verifyWaffoWebhook(env, rawBody, signature) {
  return verifyWebhook(rawBody, signature, {
    environment: env.WAFFO_ENVIRONMENT || 'test',
  });
}

export function fulfillWaffoEvent(event) {
  const db = loadDb();
  if (db.webhookEvents.includes(event.id)) return { ok: true, duplicate: true };
  db.webhookEvents.push(event.id);
  if (db.webhookEvents.length > 400) db.webhookEvents = db.webhookEvents.slice(-400);

  const data = event.data || {};
  if (event.eventType === 'order.completed') {
    fulfillGiftStar(db, data);
  }

  saveDb(db);
  return { ok: true };
}

export function waffoErrorPayload(error) {
  if (error?.code === 'waffo_not_configured') {
    return { error: 'waffo_not_configured', message: '还没有填写 WAFFO_PRIVATE_KEY。' };
  }
  if (error?.code === 'waffo_store_missing') {
    return { error: 'waffo_store_missing', message: '还没有填写 WAFFO_STORE_ID。' };
  }
  if (error instanceof WaffoPancakeError) {
    return {
      error: 'waffo_error',
      message: error.errors?.[0]?.message || error.message,
      status: error.status,
    };
  }
  return { error: 'waffo_error', message: error?.message || 'checkout_failed' };
}

function fulfillGiftStar(db, data) {
  const orderId = data.orderId;
  if (!orderId) return;
  if (db.payments.some((item) => item.orderId === orderId)) return;

  const userId = data.orderMetadata?.userId || data.merchantProvidedBuyerIdentity || '';
  const user = db.users.find((item) => item.id === userId);
  const sky =
    db.skies.find((item) => item.id === data.orderMetadata?.skyId) ||
    (user ? db.skies.find((item) => item.id === user.currentSkyId) : null);
  if (!sky) return;

  db.payments.push({
    orderId,
    userId: user?.id || '',
    skyId: sky.id,
    amount: data.chargedAmount || data.amount || '',
    currency: data.currency || '',
    createdAt: new Date().toISOString(),
  });

  if (sky.stars.some((item) => item.orderId === orderId)) return;

  const point = findFreePosition(sky.stars.filter((item) => !item.resting));
  sky.stars.push({
    id: id('star'),
    name: '点亮的星星',
    content: '有人把一颗星星，真正留在了这片天上。',
    author: user?.name || '',
    ownerType: 'us',
    color: 'stardust',
    x: point.x,
    y: point.y,
    createdAt: new Date().toISOString(),
    discovered: true,
    isSpecial: true,
    isGift: true,
    isDefault: false,
    resting: false,
    createdLocally: true,
    createdBy: user?.id || '',
    orderId,
  });
}

function saveProductId(productId) {
  const db = loadDb();
  db.waffo = { ...(db.waffo || {}), productId };
  saveDb(db);
}
