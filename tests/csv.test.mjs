import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { csv } from '../lib/csv.mjs';

test('compressed catalogue imports preserve Persian text, JSON quotes and multiline fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'torob-csv-'));
  const path = join(dir, 'products.csv');
  const content =
    '\uFEFFid,title,description\n1,"هدفون 🎧","سطر اول\nسطر دوم با ""نقل قول"""\n2,گوشی,null\n';
  try {
    await writeFile(path + '.gz', gzipSync(content));
    const rows = [];
    for await (const row of csv(path)) rows.push(row);
    assert.deepEqual(rows, [
      { id: '1', title: 'هدفون 🎧', description: 'سطر اول\nسطر دوم با "نقل قول"' },
      { id: '2', title: 'گوشی', description: null },
    ]);
    await writeFile(path, 'id,title\n3,فایل اصلی\n');
    const plain = [];
    for await (const row of csv(path)) plain.push(row);
    assert.deepEqual(plain, [{ id: '3', title: 'فایل اصلی' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
