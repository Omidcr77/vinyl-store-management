import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devApiProxy } from "../scripts/dev-api-proxy.mjs";
const target = process.env.VITE_API_TARGET || "http://127.0.0.1:5000";
export default defineConfig({
  plugins: [react(), tailwindcss(), devApiProxy(target)],
});
