import { useState } from "react";
import { useAuth } from "../services/auth";
export default function Login() {
  const { login, error: connectionError, reload } = useAuth();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await login(f.get("username"), f.get("password"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">فرش و قالین فروشی</div>
        <h1>ورود به حساب</h1>
        <p>برای مدیریت دکان، وارد حساب خود شوید.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>نام کاربری</span>
            <input
              name="username"
              required
              autoComplete="username"
              dir="ltr"
              maxLength={40}
            />
          </label>
          <label className="field">
            <span>رمز عبور</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          {(error || connectionError) && (
            <p role="alert" className="error">
              {error || connectionError}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "در حال ورود…" : "ورود"}
          </button>
        </form>
        {connectionError && <button onClick={reload}>کوشش دوباره</button>}
        <small>
          برای ساخت حساب یا بازنشانی رمز، با مدیر سیستم تماس بگیرید.
        </small>
      </section>
    </main>
  );
}
