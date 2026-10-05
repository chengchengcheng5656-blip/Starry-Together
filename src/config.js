/** Site-wide copy and tokens. Change siteTitle here without rewriting the app. */
export const siteConfig = {
  siteTitle: '我们的星星，慢慢亮起来了',
  openingFirst: 'Our Stars',
  openingSecond: 'Slowly Lighting Up',
  heroLine: '给你做了一片星空。',
  heroSub: '这里藏着一些我们的星星。',
  heroHint: '每个人都可以留下一颗。',
  whisperA: '有些话适合说出来。',
  whisperB: '有些话适合留在星星里。',
  giftLine: '点亮一颗星星',
  giftHint: '把一颗星星，真正留在这片天上。',
};

export function titleLines() {
  return {
    first: siteConfig.openingFirst,
    second: siteConfig.openingSecond,
  };
}

export const ownerTypes = [
  { id: 'me', emoji: '🌙', label: '我', cardLabel: '🌙 我' },
  { id: 'someone', emoji: '✨', label: '某个人', cardLabel: '✨ 某个人' },
  { id: 'us', emoji: '💫', label: '我们', cardLabel: '💫 我们' },
  { id: 'future', emoji: '🌱', label: '未来的我', cardLabel: '🌱 未来的我' },
  { id: 'anonymous', emoji: '☁️', label: '不想留下名字', cardLabel: '☁️ 不愿留下名字' },
];

export const starColors = [
  { id: 'ocean', emoji: '💙', label: '深海蓝', hex: '#6d8cb8' },
  { id: 'dusk', emoji: '🌅', label: '晚霞', hex: '#d4a07a' },
  { id: 'mist', emoji: '💜', label: '雾紫', hex: '#9b8bb4' },
  { id: 'moonlight', emoji: '🤍', label: '月光', hex: '#e6e1d4' },
  { id: 'stardust', emoji: '✨', label: '星光', hex: '#d8c89a' },
  { id: 'moss', emoji: '🌿', label: '青绿色', hex: '#7d9e8c' },
  { id: 'blush', emoji: '🌸', label: '淡粉', hex: '#d2a8ae' },
  { id: 'aurora', emoji: '🌌', label: '蓝紫', hex: '#7c80b5' },
];

export function ownerMeta(ownerType) {
  return ownerTypes.find((item) => item.id === ownerType) || ownerTypes[4];
}

export function colorMeta(color) {
  return starColors.find((item) => item.id === color) || starColors[0];
}

export function displayAuthor(star) {
  if (star.ownerType === 'anonymous' || !star.author?.trim()) {
    return ownerMeta(star.ownerType).cardLabel;
  }
  return star.author.trim();
}
