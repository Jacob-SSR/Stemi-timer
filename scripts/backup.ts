import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
const target = process.argv[2];
if (!target)
  throw new Error("Usage: npm run backup -- ./backups/snapshot.sqlite");
const source = path.resolve(
    process.env.STEMI_DATA_DIR || "data",
    "stemi.sqlite",
  ),
  dest = path.resolve(target);
if (!existsSync(source))
  throw new Error("Source database not found: " + source);
if (existsSync(dest))
  throw new Error("Backup already exists; choose a new filename");
mkdirSync(path.dirname(dest), { recursive: true });
const db = new DatabaseSync(source);
try {
  db.prepare("VACUUM INTO ?").run(dest);
  console.log("Backup created: " + dest);
} finally {
  db.close();
}
