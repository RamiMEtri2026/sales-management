/**
 * Backend entry point. Fails fast if the database cannot be opened.
 *
 * Run:
 *   DATABASE_PATH=/var/lib/sms/sales.db PORT=4000 npm run start:server
 *
 * Migrations run automatically on startup (idempotent). To run them alone:
 *   DATABASE_PATH=... npm run migrate
 */

import express from "express";
import cookieParser from "cookie-parser";
import { loadDbConfig, openDatabase, closeDatabase } from "./db.js";
import { buildRouter } from "./routes.js";

function main(): void {
  const config = loadDbConfig();
  const handle = openDatabase(config);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.locals.dbHandle = handle;

  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use("/api", buildRouter(handle));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "خطأ غير متوقع في الخادم.";
    // Never leak stack traces or secrets to the client.
    res.status(500).json({ code: "INTERNAL", message: "حدث خطأ داخلي. راجع سجلات الخادم." , details: process.env.NODE_ENV === "development" ? message : undefined });
  });

  const port = Number(process.env.PORT ?? 4000);
  const server = app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[sms] backend listening on :${port} — db=${config.path} schema=v${handle.schemaVersion}`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[sms] received ${signal}, shutting down`);
    server.close(() => {
      closeDatabase(handle);
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

try {
  main();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(`[sms] startup failed: ${(err as Error).message}`);
  process.exit(1);
}