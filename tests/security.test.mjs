import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("Vite blocks private data through filesystem and raw-import URLs while serving the app", async () => {
  const marker = "harmless-security-canary-" + randomUUID(),
    file = resolve(".data/security-canary-" + randomUUID() + ".txt");
  await mkdir(resolve(".data"), { recursive: true, mode: 0o700 });
  await writeFile(file, marker, { mode: 0o600 });
  const child = spawn(
    process.execPath,
    ["tests/support/vite-security-server.mjs"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const base = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(new Error("Vite security fixture startup timed out")),
        15000,
      );
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Vite security fixture exited " + code));
      });
    });
    for (const suffix of ["", "?raw", "?import"]) {
      const r = await fetch(base + "/@fs" + file + suffix, {
        signal: AbortSignal.timeout(5000),
      });
      if (suffix !== "?import") assert.equal(r.status, 403);
      assert.ok(!(await r.text()).includes(marker));
    }
    const app = await fetch(base + "/src/main.jsx", {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(app.status, 200);
    await app.text();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
      child.kill("SIGTERM");
      await exited;
      clearTimeout(timeout);
    }
    await unlink(file);
  }
});
