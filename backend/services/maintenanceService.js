import { setTimeout as delay } from "node:timers/promises";
import { AppError } from "../utils/errors.js";
let busy = false;
let active = 0;
export function maintenanceGate(req, res, next) {
  if (req.path === "/health" || /^\/backup(?:\/|$)/.test(req.path))
    return next();
  if (busy) {
    res.setHeader("Retry-After", "3");
    return res.status(503).json({
      success: false,
      error: {
        code: "MAINTENANCE",
        message: "بکاپ یا بازیابی در جریان است. چند لحظه بعد کوشش کنید.",
      },
    });
  }
  active++;
  let done = false;
  const release = () => {
    if (!done) {
      done = true;
      active--;
    }
  };
  const end = res.end;
  res.end = function (...args) {
    release();
    return end.apply(this, args);
  };
  // An aborted write can still be committing; keep it counted until its handler ends.
  if (["GET", "HEAD", "OPTIONS"].includes(req.method))
    res.once("close", release);
  next();
}
export async function withMaintenance(work) {
  if (busy) throw new AppError("عملیات بکاپ دیگری در جریان است.", 409);
  busy = true;
  try {
    const deadline = Date.now() + 20000;
    while (active) {
      if (Date.now() > deadline)
        throw new AppError(
          "درخواست‌های جاری هنوز تمام نشده‌اند. دوباره کوشش کنید.",
          409,
        );
      await delay(50);
    }
    return await work();
  } finally {
    busy = false;
  }
}
