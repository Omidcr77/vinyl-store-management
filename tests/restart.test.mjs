import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import { io as connect } from "socket.io-client";
import { devApiProxy } from "../scripts/dev-api-proxy.mjs";

test("development proxy survives API restarts, reconnects sockets and never replays writes", async () => {
  let api, sockets, port, vite, client;
  let reads = 0,
    writes = 0,
    resetRead = false,
    resetWrite = false;
  const errors = [];
  async function start() {
    api = createServer(async (req, res) => {
      if (req.url === "/api/customers") {
        reads++;
        if (resetRead) {
          resetRead = false;
          return req.socket.destroy();
        }
      }
      if (req.url === "/api/sales") {
        writes++;
        if (resetWrite) return req.socket.destroy();
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: true,
          data:
            req.url === "/api/health"
              ? { status: "ok" }
              : { items: [{ name: "Restart Customer" }] },
        }),
      );
    });
    sockets = new Server(api);
    await new Promise((resolve) => api.listen(port || 0, "127.0.0.1", resolve));
    port = api.address().port;
  }
  async function stop() {
    await new Promise((resolve) => sockets.close(resolve));
    api.closeAllConnections();
  }
  try {
    await start();
    const target = `http://127.0.0.1:${port}`;
    vite = await createViteServer({
      configFile: false,
      server: { host: "127.0.0.1", port: 0 },
      plugins: [devApiProxy(target, { timeoutMs: 1000 })],
      customLogger: {
        info() {},
        warn() {},
        warnOnce() {},
        error: (e) => errors.push(e),
        clearScreen() {},
        hasErrorLogged: () => false,
      },
    });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const connected = () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Socket did not reconnect")),
          7000,
        );
        client.once("connect", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    client = connect(base, {
      autoConnect: false,
      reconnectionDelay: 100,
      reconnectionDelayMax: 200,
    });
    const first = connected();
    client.connect();
    await first;
    await stop();
    const reconnected = connected();
    const pending = fetch(`${base}/api/customers`);
    await delay(250);
    await start();
    const result = await pending;
    assert.equal(result.status, 200);
    assert.equal((await result.json()).data.items[0].name, "Restart Customer");
    await reconnected;
    resetRead = true;
    const before = reads;
    assert.equal((await fetch(`${base}/api/customers`)).status, 200);
    assert.equal(reads - before, 2, "a connection-reset read is retried");
    resetWrite = true;
    assert.equal(
      (await fetch(`${base}/api/sales`, { method: "POST", body: "{}" })).status,
      503,
    );
    assert.equal(writes, 1, "a possibly committed sale must never be replayed");
    client.disconnect();
    await stop();
    const offline = await fetch(`${base}/api/customers`);
    assert.equal(offline.status, 503);
    assert.equal((await offline.json()).error.code, "API_UNAVAILABLE");
    assert.deepEqual(
      errors,
      [],
      "expected restarts do not produce proxy stack traces",
    );
  } finally {
    client?.disconnect();
    await vite?.close();
    if (api?.listening) await stop();
  }
});
