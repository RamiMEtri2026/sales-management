/**
 * Loads fixtures/dev-seed.sql into the DEVELOPMENT database.
 *
 * Guarded: refuses to run if the database already contains non-dev invoices,
 * so it can never pollute real data.
 *
 * Usage:
 *   DATABASE_PATH=./data/dev.db npm run seed:dev
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));

function main(): void {
  const dbPath = process.env.DATABASE_PATH;
  if (!dbPath) {
    console.error("DATABASE_PATH is required (point it at the DEVELOPMENT database).");
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const row = db
    .prepare("SELECT COUNT(*) AS n FROM invoices WHERE id NOT LIKE 'inv-dev-%'")
    .get() as { n: number };
  if (row.n > 0) {
    console.error(`Refusing to seed: database at ${dbPath} already holds ${row.n} non-dev invoice(s).`);
    process.exit(1);
  }

  const sql = readFileSync(resolve(here, "../fixtures/dev-seed.sql"), "utf8");
  db.exec(sql);
  console.log(`[seed:dev] loaded fixtures into ${dbPath}`);
  db.close();
}

main();
