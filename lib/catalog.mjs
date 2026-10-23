import { DatabaseSync } from 'node:sqlite';
export const db = new DatabaseSync(process.env.CATALOG_DB_PATH || 'data/torob.db');
db.exec(
  'CREATE TABLE IF NOT EXISTS shop_links(shop_id TEXT PRIMARY KEY, website TEXT, instagram TEXT)',
);
export const parse = (s, fallback = []) => {
  try {
    return JSON.parse(s) ?? fallback;
  } catch {
    return fallback;
  }
};
export const normalize = (s) =>
  String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f]/g, ' ')
    .toLowerCase()
    .trim();
export function distance(a, b, c, d) {
  if ([a, b, c, d].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  const r = (x) => (x * Math.PI) / 180;
  const x =
    Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 10) / 10;
}
export function opening(hours, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const h = parse(hours, {})[parts.weekday.toLowerCase()];
  if (!h || (h.status !== 'declared' && h.status !== 'closed'))
    return { state: 'unknown', label: 'ساعت کاری نامشخص' };
  if (h.status === 'closed') return { state: 'closed', label: 'امروز تعطیل' };
  const t = `${parts.hour}:${parts.minute}:00`;
  const shifts = h.shifts ?? [];
  const active = shifts.find((s) =>
    s.start_time <= s.end_time
      ? t >= s.start_time && t < s.end_time
      : t >= s.start_time || t < s.end_time,
  );
  return {
    state: active ? 'open' : 'closed',
    label: active ? `باز تا ${active.end_time.slice(0, 5)}` : 'اکنون بسته',
    shifts,
  };
}
const image = (p) => ({ ...p, images: parse(p.images), specs: parse(p.specs) });
export function search({ q = '', category = '', maxPrice, installments = false, limit = 12 } = {}) {
  const words = normalize(q).split(/\s+/).filter(Boolean).slice(0, 8);
  const where = [],
    args = [];
  for (const w of words) {
    where.push("p.search LIKE ? ESCAPE '\\'");
    args.push('%' + w.replace(/[\\%_]/g, '\\$&') + '%');
  }
  if (category) {
    where.push('p.category=?');
    args.push(category);
  }
  if (Number(maxPrice) > 0) {
    where.push(
      'EXISTS(SELECT 1 FROM offers o WHERE o.product_id=p.product_id AND o.price>0 AND o.price<=?)',
    );
    args.push(Number(maxPrice));
  }
  if (installments === true || installments === 'true') {
    where.push(
      `EXISTS(SELECT 1 FROM offers o JOIN shops s ON s.shop_id=o.shop_id, json_each(s.payments) j WHERE o.product_id=p.product_id AND json_extract(j.value,'$.channel')='in_person' ${Number(maxPrice) > 0 ? 'AND o.price>0 AND o.price<=?' : ''})`,
    );
    if (Number(maxPrice) > 0) args.push(Number(maxPrice));
  }
  const products = db
    .prepare(
      `SELECT p.*, (SELECT min(price) FROM offers WHERE product_id=p.product_id AND price>0) min_price,(SELECT max(price) FROM offers WHERE product_id=p.product_id AND price>0) max_price,(SELECT count(*) FROM offers WHERE product_id=p.product_id) seller_count FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} LIMIT ?`,
    )
    .all(...args, Math.min(Number(limit) || 12, 30));
  return products.map(image);
}
export function searchAlternatives(filters) {
  const exact = search(filters);
  if (exact.length) return { products: exact, approximate: false };
  const words = [...new Set(normalize(filters.q || '').split(/\s+/))]
    .filter(
      (word) =>
        word.length > 1 &&
        ![
          'میخوام',
          'خواهم',
          'برای',
          'خرید',
          'یک',
          'تا',
          'تومان',
          'میلیون',
          'خوب',
          'بهترین',
        ].includes(word),
    )
    .slice(0, 8);
  // Keep a known product type when relaxing model/brand details.
  const types = [
    'گوشی',
    'موبایل',
    'هدفون',
    'هندزفری',
    'کفش',
    'کتانی',
    'لپتاپ',
    'تلویزیون',
    'یخچال',
  ];
  const aliases = { موبایل: 'گوشی', کتانی: 'کفش', هندزفری: 'هدفون' };
  const anchor = words.find((word) => types.includes(word));
  const terms = anchor ? [...new Set([anchor, aliases[anchor]].filter(Boolean))] : words;
  const candidates = new Map();
  for (const term of terms) {
    for (const item of search({ ...filters, q: term, limit: 30 })) {
      const haystack = normalize(item.title + ' ' + item.brand + ' ' + item.category);
      const score = words.filter((word) => haystack.includes(word)).length;
      if (score) candidates.set(item.product_id, { item, score });
    }
  }
  return {
    approximate: candidates.size > 0,
    products: [...candidates.values()]
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.item.min_price || Infinity) - (b.item.min_price || Infinity) ||
          a.item.product_id.localeCompare(b.item.product_id),
      )
      .slice(0, Math.min(Number(filters.limit) || 6, 30))
      .map(({ item }) => item),
  };
}
export const product = (id) => {
  const p = db
    .prepare(
      `SELECT p.*, (SELECT min(price) FROM offers WHERE product_id=p.product_id AND price>0) min_price, (SELECT max(price) FROM offers WHERE product_id=p.product_id AND price>0) max_price, (SELECT count(*) FROM offers WHERE product_id=p.product_id) seller_count FROM products p WHERE product_id=?`,
    )
    .get(id);
  return p ? image(p) : null;
};
export function sellers(
  id,
  { lat, lon, installments = false, open = false, sort = 'recommended', maxPrice, radius } = {},
) {
  let rows = db
    .prepare(
      'SELECT o.*,s.name,s.address,s.lat,s.lon,s.location,s.payments,s.hours,s.contacts,l.website,l.instagram FROM offers o JOIN shops s ON s.shop_id=o.shop_id LEFT JOIN shop_links l ON l.shop_id=s.shop_id WHERE o.product_id=?',
    )
    .all(id)
    .map((r) => ({
      ...r,
      payments: parse(r.payments),
      contacts: parse(r.contacts).map((c) => ({ ...c, synthetic: true })),
      opening: opening(r.hours),
      distance: distance(lat, lon, r.lat, r.lon),
      warranty: parse(r.warranty, null),
    }));
  if (installments === true || installments === 'true')
    rows = rows.filter((r) => r.payments.some((p) => p.channel === 'in_person'));
  if (open === true || open === 'true') rows = rows.filter((r) => r.opening.state === 'open');
  if (Number(maxPrice) > 0) rows = rows.filter((r) => r.price > 0 && r.price <= Number(maxPrice));
  if (Number(radius) > 0)
    rows = rows.filter((r) => r.distance !== null && r.distance <= Number(radius));
  const min = Math.min(...rows.map((r) => r.price).filter((p) => p > 0));
  for (const r of rows)
    r.score =
      (r.price > 0 && Number.isFinite(min) ? r.price / min : 3) +
      (r.distance === null ? 1 : r.distance / 10) +
      (r.opening.state === 'closed' ? 3 : r.opening.state === 'unknown' ? 0.5 : 0);
  return rows.sort((a, b) =>
    sort === 'price'
      ? (a.price || Infinity) - (b.price || Infinity)
      : sort === 'distance'
        ? (a.distance ?? Infinity) - (b.distance ?? Infinity)
        : a.score - b.score,
  );
}
export function stats() {
  return {
    products: db.prepare('SELECT count(*) n FROM products').get().n,
    shops: db.prepare('SELECT count(*) n FROM shops').get().n,
    offers: db.prepare('SELECT count(*) n FROM offers').get().n,
  };
}
