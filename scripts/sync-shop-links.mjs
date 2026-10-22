import { DatabaseSync } from 'node:sqlite';
import { csv } from '../lib/csv.mjs';
const db = new DatabaseSync(process.env.CATALOG_DB_PATH || 'data/torob.db');
db.exec(
  'CREATE TABLE IF NOT EXISTS shop_links(shop_id TEXT PRIMARY KEY,website TEXT,instagram TEXT)',
);
const upsert = db.prepare(
  'INSERT INTO shop_links VALUES(?,?,?) ON CONFLICT(shop_id) DO UPDATE SET website=excluded.website,instagram=excluded.instagram',
);
let count = 0;
db.exec('BEGIN');
try {
  for await (const r of csv('datasets/shops.csv')) {
    if (r.website_url || r.instagram) {
      upsert.run(r.shop_id, r.website_url, r.instagram);
      count++;
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
console.log('Preserved shop website/social links:', count);
db.close();
