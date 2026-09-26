import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { uploadsDirectory } from "./config/storage.js";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  const origins = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
  app.use(cors({ origin: origins }));
  app.use((req, res, next) => {
    if (req.get("origin") && !origins.includes(req.get("origin")))
      return res.status(403).json({
        success: false,
        error: { message: "دسترسی از این آدرس مجاز نیست." },
      });
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.use(
    "/api/images",
    express.static(uploadsDirectory(), {
      index: false,
      dotfiles: "deny",
      maxAge: "1y",
      immutable: true,
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );
  app.get("/api/health", (req, res) =>
    res.json({ success: true, data: { status: "ok" } }),
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
