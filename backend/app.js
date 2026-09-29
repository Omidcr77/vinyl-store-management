import backupRoutes from "./routes/backup.js";
import { maintenanceGate } from "./services/maintenanceService.js";
import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { uploadsDirectory } from "./config/storage.js";
import authRoutes, { usersRouter, auditRouter } from "./routes/auth.js";
import { requireAuth, csrf, staffPrivacy } from "./middleware/auth.js";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  const origins = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  app.use(cors({ origin: origins, credentials: true }));
  app.use((req, res, next) => {
    if (req.get("origin") && !origins.includes(req.get("origin")))
      return res.status(403).json({
        success: false,
        error: { message: "دسترسی از این آدرس مجاز نیست." },
      });
    next();
  });
  app.use("/api", maintenanceGate);
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (req, res) =>
    res.json({ success: true, data: { status: "ok" } }),
  );
  app.use("/api/auth", authRoutes);
  app.use("/api", requireAuth, csrf, staffPrivacy);
  app.use("/api/backup", backupRoutes);
  app.use("/api/users", usersRouter);
  app.use("/api/audit", auditRouter);
  app.use(
    "/api/images",
    express.static(uploadsDirectory(), {
      index: false,
      dotfiles: "deny",
      maxAge: 0,
      cacheControl: false,
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "no-store");
      },
    }),
  );
  app.use("/api", routes);
  app.use((req, res) =>
    res
      .status(404)
      .json({ success: false, error: { message: "مسیر مورد نظر یافت نشد." } }),
  );
  app.use(errorHandler);
  return app;
}
