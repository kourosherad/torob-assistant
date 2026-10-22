import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Synthetic records keep CI independent of private keys and the challenge download.
const path = resolve(process.env.CATALOG_DB_PATH || 'data/ci-catalog.db');
if (path === resolve('data/torob.db')) throw Error('Refusing to replace the challenge catalogue.');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(`DROP TABLE IF EXISTS offers; DROP TABLE IF EXISTS products; DROP TABLE IF EXISTS shops;
CREATE TABLE products(product_id TEXT PRIMARY KEY,title TEXT,brand TEXT,category TEXT,images TEXT,model TEXT,specs TEXT,search TEXT);
CREATE TABLE shops(shop_id TEXT PRIMARY KEY,name TEXT,address TEXT,lat REAL,lon REAL,location TEXT,payments TEXT,hours TEXT,contacts TEXT);
CREATE TABLE offers(offer_id TEXT PRIMARY KEY,product_id TEXT,shop_id TEXT,price REAL,changed TEXT,title TEXT,description TEXT,warranty TEXT);`);
for (let n = 1; n <= 3; n++)
  db.prepare('INSERT INTO shops VALUES(?,?,?,?,?,?,?,?,?)').run(
    'shop_' + n,
    'فروشگاه آزمایشی ' + n,
    'تهران، پاساژ آزمایشی، طبقه ۱، واحد ' + n,
    35.7 + n / 100,
    51.4,
    'تهران',
    JSON.stringify(
      n === 1
        ? [{ provider_name: 'اقساط آزمایشی', channel: 'in_person' }]
        : n === 2
          ? [{ provider_name: 'اقساط آزمایشی', channel: 'unknown' }]
          : [],
    ),
    '{}',
    '[]',
  );
for (let n = 1; n <= 4; n++) {
  db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?)').run(
    'product_' + n,
    'هدفون آزمایشی ' + n,
    'آزمایشی',
    'هدفون',
    '[]',
    'demo-' + n,
    JSON.stringify([{ key: 'رنگ', value: 'مشکی' }]),
    'هدفون آزمایشی ' + n,
  );
  for (let shop = 1; shop <= 3; shop++)
    db.prepare('INSERT INTO offers VALUES(?,?,?,?,?,?,?,?)').run(
      `offer_${n}_${shop}`,
      'product_' + n,
      'shop_' + shop,
      n * 1000000 + shop * 10000,
      '2026-10-01T10:00:00Z',
      'هدفون آزمایشی ' + n,
      'فقط داده آزمایشی',
      null,
    );
}
db.close();
console.log('Created synthetic catalogue: 4 products, 3 shops, 12 offers.');
