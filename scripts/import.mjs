import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
mkdirSync('data', { recursive: true });
const path = resolve('data/torob.db');
if (existsSync(path) && !process.argv.includes('--force')) {
  console.log('Database exists. Use --force to rebuild.');
  process.exit(0);
}
const db = new DatabaseSync(path);
db.exec(`PRAGMA journal_mode=WAL; DROP TABLE IF EXISTS products; DROP TABLE IF EXISTS shops; DROP TABLE IF EXISTS offers;
CREATE TABLE products(product_id TEXT PRIMARY KEY,title TEXT,brand TEXT,category TEXT,images TEXT,model TEXT,specs TEXT,search TEXT);
CREATE TABLE shops(shop_id TEXT PRIMARY KEY,name TEXT,address TEXT,lat REAL,lon REAL,location TEXT,payments TEXT,hours TEXT,contacts TEXT);
CREATE TABLE offers(offer_id TEXT PRIMARY KEY,product_id TEXT,shop_id TEXT,price REAL,changed TEXT,title TEXT,description TEXT,warranty TEXT);`);
const normalize = (s) =>
  String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f]/g, ' ')
    .toLowerCase();
async function* csv(file) {
  let field = '',
    row = [],
    quoted = false,
    pendingQuote = false,
    header;
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    for (const c of chunk) {
      if (pendingQuote) {
        pendingQuote = false;
        if (c === '"') {
          field += '"';
          continue;
        }
        quoted = false;
      }
      if (quoted) {
        if (c === '"') pendingQuote = true;
        else field += c;
        continue;
      }
      if (c === '"') {
        quoted = true;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (c === '\n') {
        row.push(field.replace(/\r$/, ''));
        field = '';
        if (!header) header = row.map((x) => x.replace(/^\uFEFF/, ''));
        else yield Object.fromEntries(header.map((k, i) => [k, row[i] === 'null' ? null : row[i]]));
        row = [];
        continue;
      }
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (header)
      yield Object.fromEntries(header.map((k, i) => [k, row[i] === 'null' ? null : row[i]]));
  }
}
const jobs = [
  [
    'shops',
    'INSERT INTO shops VALUES(?,?,?,?,?,?,?,?,?)',
    (r) => [
      r.shop_id,
      r.name,
      r.address,
      Number(r.lat) || null,
      Number(r.lon) || null,
      r.location_label,
      r.payment_options,
      r.weekly_hours,
      r.contacts,
    ],
  ],
  [
    'products',
    'INSERT INTO products VALUES(?,?,?,?,?,?,?,?)',
    (r) => [
      r.product_id,
      r.persian_title,
      r.brand_name,
      r.category_name,
      r.image_urls,
      r.model,
      r.specs,
      normalize([r.persian_title, r.brand_name, r.category_name, r.model].join(' ')),
    ],
  ],
  [
    'offers',
    'INSERT INTO offers VALUES(?,?,?,?,?,?,?,?)',
    (r) => [
      r.offer_id,
      r.product_id,
      r.shop_id,
      Number(r.price_toman) || null,
      r.last_price_changed_at,
      r.seller_title,
      r.description,
      r.warranty,
    ],
  ],
];
for (const [name, sql, map] of jobs) {
  const stmt = db.prepare(sql);
  let n = 0;
  db.exec('BEGIN');
  try {
    for await (const r of csv(`datasets/${name}.csv`)) {
      stmt.run(...map(r));
      n++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(name, n);
}
db.exec(
  'CREATE INDEX offers_product ON offers(product_id);CREATE INDEX offers_shop ON offers(shop_id); CREATE INDEX products_category ON products(category);',
);
console.log(
  'Top categories:',
  db
    .prepare('SELECT category,count(*) n FROM products GROUP BY category ORDER BY n DESC LIMIT 12')
    .all(),
);
console.log(
  'Payments:',
  db
    .prepare(
      "SELECT payments,count(*) n FROM shops WHERE payments != '[]' GROUP BY payments ORDER BY n DESC LIMIT 4",
    )
    .all(),
);
db.close();
