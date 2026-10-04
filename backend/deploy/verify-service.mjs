import dotenv from "dotenv";
import database from "../db/mysql.js";
import { connectDB } from "../config/db.js";
import { EJSON } from "bson";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const mode = process.argv[2];
const path = process.argv[3];
assert.ok(
  ["snapshot", "verify"].includes(mode) && path,
  "Usage: node deploy/verify-service.mjs snapshot|verify /tmp/snapshot.json",
);
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
if (mode === "verify") {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch("http://127.0.0.1:5173/api/health", {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok && (await response.json()).data?.status === "ok") {
        ready = true;
        break;
      }
    } catch {}
    await sleep(1000);
  }
  assert.ok(ready, "Frontend/API did not become healthy");
}
await connectDB(process.env.MYSQL_URL);
try {
  const snapshot = {};
  for (const name of [
    "vinylrolls",
    "customers",
    "sales",
    "payments",
    "deliveries",
    "suppliers",
    "supplierentries",
    "users",
    "customerpricehistories",
    "settings",
    "counters",
    "customerprices",
    "authguards",
    "auditevents",
    "deletedrecords",
  ]) {
    const records = await database.connection.db
      .collection(name)
      .find({})
      .sort({ _id: 1 })
      .toArray();
    snapshot[name] = {
      count: records.length,
      recordsHash: createHash("sha256")
        .update(EJSON.stringify(records, { relaxed: false }))
        .digest("hex"),
    };
  }
  if (mode === "snapshot")
    await writeFile(path, JSON.stringify(snapshot), { mode: 0o600 });
  else
    assert.deepEqual(
      snapshot,
      JSON.parse(await readFile(path, "utf8")),
      "Stored record contents changed",
    );
  console.log(
    mode === "snapshot"
      ? "Saved record-count and content checks (no personal data)."
      : "Frontend/API healthy; all saved record counts and contents preserved.",
  );
} finally {
  await database.disconnect();
}
