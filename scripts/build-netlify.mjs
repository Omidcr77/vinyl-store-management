import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const origin = new URL(
  process.env.PUBLIC_BACKEND_URL || "https://backend-not-configured.invalid",
);
if (
  origin.protocol !== "https:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw new Error(
    "PUBLIC_BACKEND_URL must be an HTTPS origin without a path, query or credentials.",
  );
if (origin.port)
  throw new Error(
    "Use a standard HTTPS port 443 backend for Netlify proxying; use a stable HTTPS tunnel hostname instead of a custom port.",
  );
if (origin.hostname.endsWith(".invalid"))
  throw new Error(
    "Set PUBLIC_BACKEND_URL to the public HTTPS backend before deploying.",
  );
execFileSync("npm", ["run", "build", "-w", "frontend"], {
  stdio: "inherit",
  env: { ...process.env, VITE_SOCKET_TRANSPORT: "polling" },
});
await writeFile(
  "frontend/dist/_redirects",
  `/api/* ${origin.origin}/api/:splat 200!\n/socket.io/* ${origin.origin}/socket.io/:splat 200!\n/* /index.html 200\n`,
);
await writeFile(
  "frontend/dist/_headers",
  `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`,
);
console.log(
  "Netlify bundle ready: same-origin HTTPS API and Socket.IO polling proxy.",
);
