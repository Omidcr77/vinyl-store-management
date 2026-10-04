import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { waitForApi } from "../scripts/wait-for-api.mjs";
import { ensureDatabase } from "../scripts/dev-database.mjs";
import database from "../backend/db/mysql.js";
import { TestDatabase } from "../backend/tests/support/database.js";
import { connectDB } from "../backend/config/db.js";
import Customer from "../backend/models/Customer.js";

test("MySQL reuses the configured database and preserves records after reconnect", async () => {
  const db = await TestDatabase.create();
  try {
    assert.equal(await ensureDatabase(db.getUri()), null);
    await connectDB(db.getUri());
    const saved = await Customer.create({
      name: "احمد کریمی",
      phone: "0700123456",
    });
    await database.disconnect();
    await connectDB(db.getUri());
    assert.equal((await Customer.findById(saved._id)).name, "احمد کریمی");
    await assert.rejects(
      ensureDatabase("mongodb://127.0.0.1/store"),
      /MYSQL_URL/,
    );
    await assert.rejects(
      ensureDatabase("mysql://test:test@127.0.0.1:1/missing"),
      /MySQL is unavailable/,
    );
  } finally {
    await database.disconnect();
    await db.stop();
  }
});

test("frontend readiness waits for a healthy API, not just an open port", async () => {
  let ready = false;
  const server = createServer((req, res) => {
    assert.equal(req.url, "/api/health");
    res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: ready,
        data: { status: ready ? "ok" : "starting" },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(
      waitForApi(target, { timeoutMs: 100, intervalMs: 10 }),
      /API is not ready/,
    );
    const timer = setTimeout(() => {
      ready = true;
    }, 100);
    try {
      await waitForApi(target, { timeoutMs: 3000, intervalMs: 20 });
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await assert.rejects(
    waitForApi(target, { timeoutMs: 100, intervalMs: 10 }),
    /npm run db/,
  );
});
