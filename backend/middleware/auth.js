import { authenticate } from "../services/authService.js";
import { actorContext } from "../services/actor.js";
import { AppError } from "../utils/errors.js";
export async function requireAuth(req, res, next) {
  try {
    const { user, session } = await authenticate(req);
    req.user = user;
    req.loginSession = session;
    res.setHeader("Cache-Control", "no-store");
    actorContext.run(
      { user, action: `${req.method} ${req.originalUrl.split("?")[0]}` },
      next,
    );
  } catch (e) {
    next(e);
  }
}
export function csrf(req, res, next) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("X-CSRF-Token") !== req.loginSession?.csrf
  )
    return next(new AppError("درخواست معتبر نیست. صفحه را تازه کنید.", 403));
  next();
}
export const allowRoles =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : next(new AppError("اجازهٔ دسترسی به این بخش را ندارید.", 403));
export function passwordReady(req, res, next) {
  if (req.user.mustChangePassword)
    return next(new AppError("نخست رمز عبور خود را تغییر دهید.", 403));
  next();
}
export function staffPrivacy(req, res, next) {
  if (req.user.role !== "staff") return next();
  const original = res.json.bind(res);
  res.json = (body) => {
    const clean = JSON.parse(JSON.stringify(body), (key, value) =>
      ["costPrice", "inventoryValue"].includes(key) ? undefined : value,
    );
    return original(clean);
  };
  next();
}
