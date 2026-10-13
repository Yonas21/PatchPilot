import type {
  ReleasePolicy,
  RiskException,
  ReleaseDecision,
  VersionCheck,
} from '../shared/release.js';
import type { RemediationPlan } from '../shared/workbench.js';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { Activity, Inventory, Scan, Ticket } from '../shared/types.js';

interface Tables {
  policies: ReleasePolicy;
  exceptions: RiskException;
  decisions: ReleaseDecision;
  versionChecks: VersionCheck;
  plans: RemediationPlan;
  inventories: Inventory;
  scans: Scan;
  tickets: Ticket;
  activity: Activity;
}
type Table = keyof Tables;
const tables: Table[] = [
  'inventories',
  'scans',
  'tickets',
  'activity',
  'plans',
  'policies',
  'exceptions',
  'decisions',
  'versionChecks',
];

export class Store {
  private db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    for (const table of tables) {
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL)`,
      );
    }
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ticket_finding ON tickets
      (json_extract(payload, '$.inventoryId'), json_extract(payload, '$.findingKey'))`);
  }
  list<T extends Table>(table: T): Tables[T][] {
    return this.db
      .prepare(`SELECT payload FROM ${table} ORDER BY rowid DESC`)
      .all()
      .map((row) => JSON.parse(String(row.payload)) as Tables[T]);
  }
  get<T extends Table>(table: T, id: string): Tables[T] | undefined {
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id);
    return row ? (JSON.parse(String(row.payload)) as Tables[T]) : undefined;
  }
  put<T extends Table>(table: T, value: Tables[T]): Tables[T] {
    this.db
      .prepare(
        `INSERT INTO ${table} (id, payload) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
      )
      .run(value.id, JSON.stringify(value));
    return value;
  }
  event(kind: Activity['kind'], title: string, detail: string) {
    return this.put('activity', {
      id: randomUUID(),
      kind,
      title,
      detail,
      createdAt: new Date().toISOString(),
    });
  }
  close() {
    this.db.close();
  }
}
