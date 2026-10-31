// Stream the API through a dedicated HTTP tunnel origin or an optional HTTPS listener.
// No static frontend or database port is exposed by this gateway; writes are never retried.
import http from "node:http";
import https from "node:https";
import { readFileSync, statSync } from "node:fs";
import { createProxyServer } from "http-proxy-3";
const host = process.env.PUBLIC_API_HOST || "127.0.0.1";
const port = Number(process.env.PUBLIC_API_PORT || 5105);
function target() {
  const value = process.env.PUBLIC_API_TARGET_FILE
    ? JSON.parse(readFileSync(process.env.PUBLIC_API_TARGET_FILE, "utf8"))
        .target
    : process.env.PUBLIC_API_TARGET || "http://127.0.0.1:5001";
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Public API upstream must be a local HTTP origin.");
  return url.origin;
}
target();
const proxy = createProxyServer({
  ws: true,
  changeOrigin: true,
  proxyTimeout: 120000,
});
const valid = (url) =>
  url === "/api" || url.startsWith("/api/") || url.startsWith("/socket.io/");
const fail = (res) => {
  if (res?.writeHead && !res.headersSent)
    res
      .writeHead(503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      .end(
        JSON.stringify({
          success: false,
          error: { message: "Store API temporarily unavailable." },
        }),
      );
  else res?.destroy();
};
proxy.on("error", (_error, _req, res) => fail(res));
const handler = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!valid(req.url)) {
    res.writeHead(404).end();
    return;
  }
  if (req.socket.encrypted) req.headers["x-forwarded-proto"] = "https";
  try {
    proxy.web(req, res, { target: target() });
  } catch {
    fail(res);
  }
};
const cert = process.env.PUBLIC_API_TLS_CERT,
  key = process.env.PUBLIC_API_TLS_KEY;
if (Boolean(cert) !== Boolean(key))
  throw new Error("Configure both PUBLIC_API_TLS_CERT and PUBLIC_API_TLS_KEY.");
const tls = () => ({ cert: readFileSync(cert), key: readFileSync(key) });
const server = cert
  ? https.createServer(tls(), handler)
  : http.createServer(handler);
server.on("upgrade", (req, socket, head) => {
  if (!valid(req.url)) {
    socket.destroy();
    return;
  }
  if (req.socket.encrypted) req.headers["x-forwarded-proto"] = "https";
  try {
    proxy.ws(req, socket, head, { target: target() });
  } catch {
    socket.destroy();
  }
});
// Reload renewed certificate files without interrupting existing connections.
let reload;
if (cert) {
  let previous = statSync(cert).mtimeMs;
  reload = setInterval(() => {
    try {
      const current = statSync(cert).mtimeMs;
      if (current !== previous) {
        server.setSecureContext(tls());
        previous = current;
      }
    } catch {
      console.error(
        "TLS reload failed; retaining the last working certificate.",
      );
    }
  }, 30000);
  reload.unref();
}
server.listen(port, host, () =>
  console.log(
    `Public API gateway ready on ${cert ? "https" : "http"}://${host}:${server.address().port}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(reload);
    proxy.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
