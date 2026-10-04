const MIN_GAP = 0.09;

export function hashString(value) {
  let hash = 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function starVisuals(star) {
  const hash = hashString(star.id);
  const isUs = star.ownerType === 'us';
  const size = isUs ? 'l' : star.isEasterEgg ? 's' : ['s', 'm', 'm', 'l'][hash % 4];
  const brightness = star.dimmed ? 0.5 : 0.72 + (hash % 26) / 100;
  return {
    size,
    brightness,
    twinkleDuration: `${(3.2 + (hash % 28) / 10).toFixed(1)}s`,
    twinkleDelay: `${((hash % 17) / 10).toFixed(1)}s`,
    floatDuration: `${(9 + (hash % 50) / 6).toFixed(1)}s`,
    floatDelay: `${((hash % 13) / 5).toFixed(1)}s`,
    driftX: `${(((hash % 11) - 5) * 0.4).toFixed(1)}px`,
    driftY: `${(3 + (hash % 7)).toFixed(1)}px`,
  };
}

export function overlaps(stars, x, y, gap = MIN_GAP) {
  return stars.some((star) => {
    if (star.resting) return false;
    const dx = star.x - x;
    const dy = star.y - y;
    return Math.hypot(dx, dy) < gap;
  });
}

export function findFreePosition(stars) {
  for (let i = 0; i < 48; i += 1) {
    const x = 0.1 + Math.random() * 0.8;
    const y = 0.1 + Math.random() * 0.68;
    if (!overlaps(stars, x, y)) {
      return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
    }
  }
  return {
    x: Number((0.18 + Math.random() * 0.64).toFixed(3)),
    y: Number((0.16 + Math.random() * 0.56).toFixed(3)),
  };
}

export function toPercent(value) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}
