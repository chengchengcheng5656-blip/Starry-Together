import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'data', 'starry.json');

const empty = () => ({
  users: [],
  sessions: [],
  skies: [],
  members: [],
  invites: [],
  payments: [],
  webhookEvents: [],
  waffo: { productId: '' },
});

export function loadDb() {
  try {
    if (!fs.existsSync(file)) return empty();
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function saveDb(db) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}

export function id(prefix) {
  return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}
