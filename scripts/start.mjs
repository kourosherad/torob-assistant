import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
const catalogue = process.env.CATALOG_DB_PATH || 'data/torob.db';
mkdirSync(dirname(catalogue), { recursive: true });
mkdirSync(dirname(process.env.WORKFLOW_DB_PATH || 'data/workflow.db'), { recursive: true });
if (!existsSync(catalogue)) {
  if (existsSync('seed/torob.db')) copyFileSync('seed/torob.db', catalogue);
  else await import('./import.mjs');
}
await import('../server.mjs');
