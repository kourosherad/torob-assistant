import { existsSync, mkdirSync } from 'node:fs';
import { csv } from '../lib/csv.mjs';
import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
const path = resolve(process.env.CATALOG_DB_PATH || 'data/torob.db');
mkdirSync(dirname(path), { recursive: true });
if (existsSync(path) && !process.argv.includes('--force')) {
  console.log('Database exists. Use --force to rebuild.');
  process.exit(0);
}
const db = new DatabaseSync(path);
db.exec(`PRAGMA journal_mode=WAL; DROP TABLE IF EXISTS products; DROP TABLE IF EXISTS shops; DROP TABLE IF EXISTS offers; DROP TABLE IF EXISTS shop_links;
CREATE TABLE shop_links(shop_id TEXT PRIMARY KEY,website TEXT,instagram TEXT);
CREATE TABLE products(product_id TEXT PRIMARY KEY,title TEXT,brand TEXT,category TEXT,images TEXT,model TEXT,specs TEXT,search TEXT);
CREATE TABLE shops(shop_id TEXT PRIMARY KEY,name TEXT,address TEXT,lat REAL,lon REAL,location TEXT,payments TEXT,hours TEXT,contacts TEXT);
CREATE TABLE offers(offer_id TEXT PRIMARY KEY,product_id TEXT,shop_id TEXT,price REAL,changed TEXT,title TEXT,description TEXT,warranty TEXT);`);
const normalize = (s) =>
  String(s ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f]/g, ' ')
    .toLowerCase();

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
      if (name === 'shops' && (r.website_url || r.instagram))
        db.prepare('INSERT INTO shop_links VALUES(?,?,?)').run(
          r.shop_id,
          r.website_url,
          r.instagram,
        );
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
