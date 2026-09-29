import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { waitForApi } from "../scripts/wait-for-api.mjs";
import { ensureDatabase } from "../scripts/dev-database.mjs";
import mongoose from "mongoose";
import { resetPortsCache } from "mongodb-memory-server-core/lib/util/getport/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename } from "node:path";

test("development database starts cold, reuses running MongoDB, and retains data after restart", async () => {
  const reservation = createServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const folder = await mkdtemp(resolve(tmpdir(), "vinyl-startup-"));
  const uri = `mongodb://127.0.0.1:${port}/startup?replicaSet=rs0`;
  const options = { port, dbPath: folder };
  let db, connection;
  try {
    db = await ensureDatabase(uri, options);
    assert.ok(db, "cold start must own the local database");
    connection = await mongoose.createConnection(uri).asPromise();
    await connection.db
      .collection("retained")
      .insertOne({ _id: "record", value: 42 });
    await connection.close();
    connection = null;
    assert.equal(
      await ensureDatabase(uri, options),
      null,
      "running databases are reused, not owned",
    );
    await db.stop({ doCleanup: false });
    db = null;
    // A real launcher restart is a fresh Node process with an empty port cache.
    resetPortsCache();
    db = await ensureDatabase(uri, options);
    connection = await mongoose.createConnection(uri).asPromise();
    assert.equal(
      (await connection.db.collection("retained").findOne({ _id: "record" }))
        .value,
      42,
    );
  } finally {
    await connection?.close();
    await db?.stop({ doCleanup: false });
    const target = resolve(folder);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("vinyl-startup-"));
    await rm(target, { recursive: true, force: true });
  }
  await assert.rejects(
    ensureDatabase(
      `mongodb://127.0.0.1:${port}/custom?replicaSet=custom`,
      options,
    ),
    /No fallback database/,
  );
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
