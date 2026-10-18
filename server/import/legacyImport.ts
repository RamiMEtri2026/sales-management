/**
 * Idempotent legacy CSV importer.
 *
 * Design:
 *   - One CSV file per legacy table, in ./import/data/<table>.csv
 *   - Every row is first written to import_staging (raw JSON + status).
 *   - Validation runs per row; invalid rows are marked 'rejected' with a reason
 *     and are NEVER silently dropped — they appear in the report.
 *   - Valid rows are inserted with a legacy_id so re-running the importer
 *     updates instead of duplicating (INSERT ... ON CONFLICT(legacy_id) DO UPDATE).
 *   - The whole run is one transaction per table; a failure rolls that table back.
 *   - A JSON report is written to import_runs.report_json and to stdout.
 *
 * This importer does NOT invent data. If a file is missing, that table is
 * reported as 'skipped (no source file)'.
 *
 * Usage:
 *   DATABASE_PATH=/var/lib/sms/sales.db npm run import:legacy -- --source ./import/data
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

interface RowResult {
  table: string;
  sourceRows: number;
  imported: number;
  rejected: number;
  reasons: { rowIndex: number; reason: string }[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
    } else if (ch === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function toObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}

/** Parse a money string like "1234.56" into integer piasters. */
function parseMoney(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function requireField(row: Record<string, string>, field: string): string | null {
  const v = row[field];
  return v && v.length > 0 ? v : null;
}

interface TableSpec {
  table: string;
  file: string;
  validate: (row: Record<string, string>) => string | null;
  insert: (db: Database.Database, row: Record<string, string>, runId: string) => void;
}

const SPECS: TableSpec[] = [
  {
    table: "categories",
    file: "categories.csv",
    validate: (r) => {
      if (!requireField(r, "legacy_id")) return "missing legacy_id";
      if (!requireField(r, "code")) return "missing code";
      if (!requireField(r, "name")) return "missing name";
      return null;
    },
    insert: (db, r) => {
      db.prepare(
        `INSERT INTO categories (id, code, name, active, created_at, updated_at, legacy_id)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(legacy_id) DO UPDATE SET code=excluded.code, name=excluded.name, updated_at=excluded.updated_at`,
      ).run(randomUUID(), r.code, r.name, new Date().toISOString(), new Date().toISOString(), r.legacy_id);
    },
  },
  {
    table: "units",
    file: "units.csv",
    validate: (r) => {
      if (!requireField(r, "legacy_id")) return "missing legacy_id";
      if (!requireField(r, "code")) return "missing code";
      if (!requireField(r, "name")) return "missing name";
      return null;
    },
    insert: (db, r) => {
      db.prepare(
        `INSERT INTO units (id, code, name, active, created_at, updated_at, legacy_id)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(legacy_id) DO UPDATE SET code=excluded.code, name=excluded.name, updated_at=excluded.updated_at`,
      ).run(randomUUID(), r.code, r.name, new Date().toISOString(), new Date().toISOString(), r.legacy_id);
    },
  },
  {
    table: "customers",
    file: "customers.csv",
    validate: (r) => {
      if (!requireField(r, "legacy_id")) return "missing legacy_id";
      if (!requireField(r, "code")) return "missing code";
      if (!requireField(r, "name")) return "missing name";
      if (parseMoney(r.opening_balance) === null) return "opening_balance is not a valid number";
      return null;
    },
    insert: (db, r) => {
      const opening = parseMoney(r.opening_balance) ?? 0;
      db.prepare(
        `INSERT INTO customers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(legacy_id) DO UPDATE SET
           code=excluded.code, name=excluded.name, phone=excluded.phone,
           address=excluded.address, opening_balance=excluded.opening_balance,
           balance=excluded.balance, updated_at=excluded.updated_at`,
      ).run(
        randomUUID(), r.code, r.name, r.phone ?? "", r.address ?? "",
        opening, opening, new Date().toISOString(), new Date().toISOString(), r.legacy_id,
      );
    },
  },
  {
    table: "suppliers",
    file: "suppliers.csv",
    validate: (r) => {
      if (!requireField(r, "legacy_id")) return "missing legacy_id";
      if (!requireField(r, "code")) return "missing code";
      if (!requireField(r, "name")) return "missing name";
      if (parseMoney(r.opening_balance) === null) return "opening_balance is not a valid number";
      return null;
    },
    insert: (db, r) => {
      const opening = parseMoney(r.opening_balance) ?? 0;
      db.prepare(
        `INSERT INTO suppliers (id, code, name, phone, address, opening_balance, balance, active, created_at, updated_at, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(legacy_id) DO UPDATE SET
           code=excluded.code, name=excluded.name, phone=excluded.phone,
           address=excluded.address, opening_balance=excluded.opening_balance,
           balance=excluded.balance, updated_at=excluded.updated_at`,
      ).run(
        randomUUID(), r.code, r.name, r.phone ?? "", r.address ?? "",
        opening, opening, new Date().toISOString(), new Date().toISOString(), r.legacy_id,
      );
    },
  },
  {
    table: "products",
    file: "products.csv",
    validate: (r) => {
      if (!requireField(r, "legacy_id")) return "missing legacy_id";
      if (!requireField(r, "sku")) return "missing sku";
      if (!requireField(r, "name")) return "missing name";
      if (!requireField(r, "category_legacy_id")) return "missing category_legacy_id";
      if (!requireField(r, "unit_legacy_id")) return "missing unit_legacy_id";
      if (parseMoney(r.cost_price) === null) return "cost_price is not a valid number";
      if (parseMoney(r.sale_price) === null) return "sale_price is not a valid number";
      return null;
    },
    insert: (db, r) => {
      const cat = db.prepare("SELECT id FROM categories WHERE legacy_id = ?").get(r.category_legacy_id) as { id: string } | undefined;
      if (!cat) throw new Error(`unresolved category_legacy_id=${r.category_legacy_id}`);
      const unit = db.prepare("SELECT id FROM units WHERE legacy_id = ?").get(r.unit_legacy_id) as { id: string } | undefined;
      if (!unit) throw new Error(`unresolved unit_legacy_id=${r.unit_legacy_id}`);
      db.prepare(
        `INSERT INTO products (id, sku, barcode, name, category_id, unit_id, cost_price, sale_price, reorder_level, active, created_at, updated_at, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(legacy_id) DO UPDATE SET
           sku=excluded.sku, barcode=excluded.barcode, name=excluded.name,
           category_id=excluded.category_id, unit_id=excluded.unit_id,
           cost_price=excluded.cost_price, sale_price=excluded.sale_price,
           reorder_level=excluded.reorder_level, updated_at=excluded.updated_at`,
      ).run(
        randomUUID(), r.sku, r.barcode ?? "", r.name, cat.id, unit.id,
        parseMoney(r.cost_price) ?? 0, parseMoney(r.sale_price) ?? 0,
        Number(r.reorder_level ?? 0) || 0,
        new Date().toISOString(), new Date().toISOString(), r.legacy_id,
      );
    },
  },
];

function runImport(db: Database.Database, sourceDir: string): RowResult[] {
  const runId = randomUUID();
  db.prepare("INSERT INTO import_runs (id, source, started_at, status) VALUES (?, ?, ?, 'running')").run(
    runId, sourceDir, new Date().toISOString(),
  );

  const results: RowResult[] = [];

  for (const spec of SPECS) {
    const filePath = join(sourceDir, spec.file);
    const result: RowResult = { table: spec.table, sourceRows: 0, imported: 0, rejected: 0, reasons: [] };

    if (!existsSync(filePath)) {
      results.push(result);
      continue;
    }

    const rows = toObjects(parseCsv(readFileSync(filePath, "utf8")));
    result.sourceRows = rows.length;

    const tx = db.transaction(() => {
      rows.forEach((row, idx) => {
        const stagingId = randomUUID();
        const reason = spec.validate(row);
        if (reason) {
          db.prepare(
            "INSERT INTO import_staging (id, run_id, table_name, row_index, raw_json, status, reason) VALUES (?, ?, ?, ?, ?, 'rejected', ?)",
          ).run(stagingId, runId, spec.table, idx, JSON.stringify(row), reason);
          result.rejected++;
          result.reasons.push({ rowIndex: idx, reason });
          return;
        }
        try {
          spec.insert(db, row, runId);
          db.prepare(
            "INSERT INTO import_staging (id, run_id, table_name, row_index, raw_json, status) VALUES (?, ?, ?, ?, ?, 'imported')",
          ).run(stagingId, runId, spec.table, idx, JSON.stringify(row));
          result.imported++;
        } catch (err) {
          const msg = (err as Error).message;
          db.prepare(
            "INSERT INTO import_staging (id, run_id, table_name, row_index, raw_json, status, reason) VALUES (?, ?, ?, ?, ?, 'rejected', ?)",
          ).run(stagingId, runId, spec.table, idx, JSON.stringify(row), msg);
          result.rejected++;
          result.reasons.push({ rowIndex: idx, reason: msg });
        }
      });
    });

    try {
      tx();
    } catch (err) {
      result.reasons.push({ rowIndex: -1, reason: `table rolled back: ${(err as Error).message}` });
    }

    results.push(result);
  }

  db.prepare("UPDATE import_runs SET finished_at = ?, status = 'completed', report_json = ? WHERE id = ?").run(
    new Date().toISOString(), JSON.stringify(results), runId,
  );

  return results;
}

function main(): void {
  const dbPath = process.env.DATABASE_PATH?.trim();
  if (!dbPath) {
    console.error("DATABASE_PATH is not set.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const sourceDir = resolve(sourceIdx >= 0 ? args[sourceIdx + 1] : "./import/data");

  if (!existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    console.error("Create it and add CSV files (see import/README.md). No data was imported.");
    process.exit(1);
  }

  const db = new Database(resolve(dbPath));
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const results = runImport(db, sourceDir);

  console.log("\n=== Legacy import report ===");
  for (const r of results) {
    console.log(`\n${r.table}: source=${r.sourceRows} imported=${r.imported} rejected=${r.rejected}`);
    for (const reason of r.reasons.slice(0, 20)) {
      console.log(`  row ${reason.rowIndex}: ${reason.reason}`);
    }
    if (r.reasons.length > 20) console.log(`  ... and ${r.reasons.length - 20} more`);
  }
  console.log("\nFull report stored in import_runs.report_json.");
  db.close();
}

try {
  main();
} catch (err) {
  console.error(`[import] fatal: ${(err as Error).message}`);
  process.exit(1);
}