import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("public gateway streams cookies and bodies, restricts paths, and never replays failed writes", async () => {
  let writes = 0,
    reads = 0;
  const upstream = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.method === "POST") writes++;
    else reads++;
    if (body === "drop-after-receiving") {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": "store_session=example; Secure; HttpOnly; SameSite=Strict",
    });
    res.end(
      JSON.stringify({
        body,
        origin: req.headers.origin,
        requested: req.headers["x-requested-with"],
      }),
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const child = spawn(process.execPath, ["scripts/public-api-proxy.mjs"], {
    env: {
      ...process.env,
      PUBLIC_API_HOST: "127.0.0.1",
      PUBLIC_API_PORT: "0",
      PUBLIC_API_TARGET: `http://127.0.0.1:${upstream.address().port}`,
      PUBLIC_API_TARGET_FILE: "",
      PUBLIC_API_TLS_CERT: "",
      PUBLIC_API_TLS_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(
        () => reject(new Error("Gateway startup timed out")),
        10000,
      );
      child.stdout.on("data", (chunk) => {
        text += chunk;
        const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Gateway exited " + code));
      });
    });
    const response = await fetch(base + "/api/echo", {
      method: "POST",
      headers: {
        Origin: "https://shop.netlify.app",
        "X-Requested-With": "store-app",
      },
      body: "a streaming request body",
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie"), /Secure; HttpOnly/);
    assert.deepEqual(await response.json(), {
      body: "a streaming request body",
      origin: "https://shop.netlify.app",
      requested: "store-app",
    });
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal(reads, 0);
    const failed = await fetch(base + "/api/write", {
      method: "POST",
      body: "drop-after-receiving",
    });
    assert.equal(failed.status, 503);
    assert.equal(writes, 2, "Failed forwarded writes must never retry");
    assert.equal((await failed.json()).success, false);
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await new Promise((resolve) => upstream.close(resolve));
  }
});
