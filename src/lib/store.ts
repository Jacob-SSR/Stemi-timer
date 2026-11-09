import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { defaults, type State } from "./model";
let db: DatabaseSync | undefined;
function database() {
  if (!db) {
    const dir = path.resolve(process.env.STEMI_DATA_DIR || "data");
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(path.join(dir, "stemi.sqlite"));
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
    );
    const initial: State = {
      cases: [],
      log: [],
      dismissed: [],
      targets: { ...defaults },
      demoBase: Date.now() - 18 * 60000,
      pending: [],
      gsError: "",
      gsLastTry: 0,
      revision: 0,
    };
    db.prepare("INSERT OR IGNORE INTO state VALUES(1,?)").run(
      JSON.stringify(initial),
    );
  }
  return db;
}
export function readState(): State {
  const row = database()
    .prepare("SELECT payload FROM state WHERE id=1")
    .get() as { payload: string };
  return JSON.parse(row.payload);
}
// Synchronous SQLite transactions coordinate separate workers as well as browser clients.
export function changeState<T>(fn: (state: State) => T): T {
  const d = database();
  d.exec("BEGIN IMMEDIATE");
  try {
    const s = readState();
    const result = fn(s);
    s.revision++;
    d.prepare("UPDATE state SET payload=? WHERE id=1").run(JSON.stringify(s));
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
