import { useState } from "react";
import { useAuth, roleLabels } from "../services/auth";
import { api } from "../services/api";
export default function Account({ forced = false }) {
  const { user, clear, logout } = useAuth();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm"))
      return setError("تکرار رمز با رمز جدید یکسان نیست.");
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: {
          currentPassword: f.get("currentPassword"),
          password: f.get("password"),
        },
      });
      clear();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={forced ? "login-page" : "account-page"}>
      <div className="login-card">
        <h1>تغییر رمز عبور</h1>
        <p>
          {user.name} · {roleLabels[user.role]}
        </p>
        <p>
          {forced
            ? "برای شروع، رمز موقت خود را تغییر دهید."
            : "پس از تغییر رمز، دوباره وارد شوید."}
        </p>
        <form onSubmit={submit}>
          <label className="field">
            <span>رمز فعلی</span>
            <input
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label className="field">
            <span>رمز جدید</span>
            <input
              aria-label="رمز جدید"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
            />
            <small>حداقل 12 حرف</small>
          </label>
          <label className="field">
            <span>تکرار رمز جدید</span>
            <input
              name="confirm"
              type="password"
              required
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            ذخیرهٔ رمز جدید
          </button>
        </form>
        {forced && (
          <button onClick={() => logout().catch((e) => setError(e.message))}>
            خروج
          </button>
        )}
      </div>
    </section>
  );
}
