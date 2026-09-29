import httpProxy from "http-proxy-3";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { waitForApi } from "./wait-for-api.mjs";

const transient = new Set(["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"]);
const matches = (url = "") => /^\/(api|socket\.io)(\/|\?|$)/.test(url);

// Keep the frontend available while Node's watch process replaces the API.
// Only body-free reads can be replayed after forwarding; never replay a write.
export function devApiProxy(target, { timeoutMs = 15000 } = {}) {
  return {
    name: "store-api-proxy",
    apply: "serve",
    async configureServer(server) {
      server.config.logger.info(`Waiting for store API at ${target}…`);
      await waitForApi(target);
      server.config.logger.info("Store API ready; starting frontend.");
      const proxy = httpProxy.createProxyServer({ target, changeOrigin: true });
      let readiness;
      const ready = () => {
        readiness ||= waitForApi(target, {
          timeoutMs,
          intervalMs: 150,
        }).finally(() => {
          readiness = null;
        });
        return readiness;
      };
      const unavailable = (res) => {
        if (res.destroyed || res.writableEnded) return;
        if (res.headersSent) return res.destroy();
        res.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": "2",
        });
        res.end(
          JSON.stringify({
            success: false,
            error: {
              code: "API_UNAVAILABLE",
              message:
                "سرور موقتاً در دسترس نیست. لطفاً چند لحظه بعد دوباره کوشش کنید.",
            },
          }),
        );
      };
      // Upgraded sockets can emit errors after the per-request callback has
      // finished. Without this listener http-proxy terminates the Vite process.
      proxy.on('error', (error, req, response) => {
        if (!transient.has(error.code)) server.config.logger.error(`Store proxy: ${error.message}`);
        if (typeof response?.writeHead === 'function') unavailable(response);
        else response?.destroy();
      });
      server.middlewares.use(async (req, res, next) => {
        if (!matches(req.url)) return next();
        const deadline = Date.now() + timeoutMs;
        const replayable =
          ["GET", "HEAD"].includes(req.method) &&
          !req.headers["transfer-encoding"] &&
          !Number(req.headers["content-length"]);
        let retry = false;
        while (!res.destroyed && !res.writableEnded) {
          try {
            await ready();
          } catch {
            return unavailable(res);
          }
          if (res.destroyed || res.writableEnded) return;
          const error = await new Promise((resolve) => {
            const done = (error) => {
              res.off("finish", complete);
              res.off("close", complete);
              resolve(error);
            };
            const complete = () => done(null);
            res.once("finish", complete);
            res.once("close", complete);
            // A replayed read has an already-consumed IncomingMessage stream.
            proxy.web(
              req,
              res,
              retry ? { buffer: Readable.from([]) } : {},
              done,
            );
          });
          if (!error) return;
          if (!transient.has(error.code))
            server.config.logger.error(`Store proxy: ${error.message}`);
          if (
            !replayable ||
            !transient.has(error.code) ||
            res.headersSent ||
            Date.now() >= deadline
          )
            return unavailable(res);
          retry = true;
          await delay(150);
        }
      });
      const upgrade = async (req, socket, head) => {
        if (!matches(req.url)) return;
        try {
          await ready();
        } catch {
          return socket.destroy();
        }
        if (socket.destroyed) return;
        proxy.ws(req, socket, head, (error) => {
          if (!transient.has(error.code))
            server.config.logger.error(`Store websocket: ${error.message}`);
          socket.destroy(); // Socket.IO reconnects with a fresh session.
        });
      };
      server.httpServer?.on("upgrade", upgrade);
      server.httpServer?.once("close", () => {
        server.httpServer.off("upgrade", upgrade);
        proxy.close();
      });
    },
  };
}
