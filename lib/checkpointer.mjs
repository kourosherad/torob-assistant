import { DatabaseSync } from 'node:sqlite';
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  compareWritesSortKeys,
  writesSortKey,
} from '@langchain/langgraph-checkpoint';

// Uses Node's SQLite runtime, so installation requires no native build toolchain.
export class SqliteCheckpointer extends BaseCheckpointSaver {
  constructor(path = 'data/workflow.db') {
    super();
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS checkpoints(thread TEXT, ns TEXT, id TEXT, parent TEXT, type TEXT, value BLOB, meta_type TEXT, meta BLOB, PRIMARY KEY(thread,ns,id));
   CREATE TABLE IF NOT EXISTS checkpoint_writes(thread TEXT, ns TEXT, id TEXT, task TEXT, idx INTEGER, path TEXT, channel TEXT, type TEXT, value BLOB, PRIMARY KEY(thread,ns,id,task,idx));`);
  }
  async getTuple(config) {
    const {
      thread_id: thread,
      checkpoint_ns: ns = '',
      checkpoint_id: id,
    } = config.configurable || {};
    if (!thread) return undefined;
    const row = id
      ? this.db
          .prepare('SELECT * FROM checkpoints WHERE thread=? AND ns=? AND id=?')
          .get(thread, ns, id)
      : this.db
          .prepare('SELECT * FROM checkpoints WHERE thread=? AND ns=? ORDER BY id DESC LIMIT 1')
          .get(thread, ns);
    return row ? this.tuple(row) : undefined;
  }
  async tuple(r) {
    const records = this.db
      .prepare('SELECT * FROM checkpoint_writes WHERE thread=? AND ns=? AND id=?')
      .all(r.thread, r.ns, r.id);
    records.sort((a, b) =>
      compareWritesSortKeys(
        writesSortKey(a.path, a.task, a.idx),
        writesSortKey(b.path, b.task, b.idx),
      ),
    );
    return {
      config: { configurable: { thread_id: r.thread, checkpoint_ns: r.ns, checkpoint_id: r.id } },
      checkpoint: await this.serde.loadsTyped(r.type, r.value),
      metadata: await this.serde.loadsTyped(r.meta_type, r.meta),
      parentConfig: r.parent
        ? { configurable: { thread_id: r.thread, checkpoint_ns: r.ns, checkpoint_id: r.parent } }
        : undefined,
      pendingWrites: await Promise.all(
        records.map(async (w) => [w.task, w.channel, await this.serde.loadsTyped(w.type, w.value)]),
      ),
    };
  }
  async put(config, checkpoint, metadata) {
    const {
      thread_id: thread,
      checkpoint_ns: ns = '',
      checkpoint_id: parent,
    } = config.configurable;
    const [type, value] = await this.serde.dumpsTyped(checkpoint),
      [mt, mv] = await this.serde.dumpsTyped(metadata);
    this.db
      .prepare('INSERT OR REPLACE INTO checkpoints VALUES(?,?,?,?,?,?,?,?)')
      .run(thread, ns, checkpoint.id, parent ?? null, type, value, mt, mv);
    return { configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: checkpoint.id } };
  }
  async putWrites(config, writes, task, path = '') {
    const { thread_id: thread, checkpoint_ns: ns = '', checkpoint_id: id } = config.configurable;
    for (let i = 0; i < writes.length; i++) {
      const [channel, val] = writes[i],
        idx = WRITES_IDX_MAP[channel] ?? i,
        [type, value] = await this.serde.dumpsTyped(val);
      const statement = idx < 0 ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
      this.db
        .prepare(`${statement} INTO checkpoint_writes VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(thread, ns, id, task, idx, path, channel, type, value);
    }
  }
  async *list(config, options = {}) {
    const clauses = [],
      args = [];
    const c = config?.configurable || {};
    if (c.thread_id) {
      clauses.push('thread=?');
      args.push(c.thread_id);
    }
    if (c.checkpoint_ns !== undefined) {
      clauses.push('ns=?');
      args.push(c.checkpoint_ns);
    }
    if (options.before?.configurable?.checkpoint_id) {
      clauses.push('id<?');
      args.push(options.before.configurable.checkpoint_id);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM checkpoints ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY id DESC`,
      )
      .all(...args);
    let count = 0;
    for (const row of rows) {
      const tuple = await this.tuple(row);
      if (
        options.filter &&
        Object.entries(options.filter).some(
          ([k, v]) => JSON.stringify(tuple.metadata?.[k]) !== JSON.stringify(v),
        )
      )
        continue;
      if (options.limit !== undefined && count >= options.limit) break;
      count++;
      yield tuple;
    }
  }
  async deleteThread(thread) {
    this.db.prepare('DELETE FROM checkpoint_writes WHERE thread=?').run(thread);
    this.db.prepare('DELETE FROM checkpoints WHERE thread=?').run(thread);
  }
  close() {
    this.db.close();
  }
}
