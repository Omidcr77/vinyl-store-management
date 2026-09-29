import { useState } from "react";
import { Settings2 } from "lucide-react";
import { api } from "../services/api";
import { useResource, useStore } from "../services/store";
import { PageHeading, Field, ErrorMessage, Loading } from "../components/UI";
import { formValues, invoiceFooter } from "../utils/format";
export default function Settings() {
  const { data, loading, error: loadError } = useResource("/settings"),
    { refresh, notice } = useStore(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/settings", {
        method: "PUT",
        body: formValues(e.currentTarget, [
          "lowStockThreshold",
          "defaultVinylWidth",
        ]),
      });
      refresh();
      notice("تنظیمات دکان ذخیره شد.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="تنظیمات دکان"
        title="تنظیمات"
        description="تنظیمات دکان خود را مشخص کنید."
      />
      <ErrorMessage error={loadError} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <div className="form-layout">
            <form className="panel form-panel" onSubmit={submit}>
              <h2>معلومات دکان</h2>
              <div className="form-grid">
                <Field
                  label="تقویم"
                  hint="نمایش و ورود تاریخ‌ها؛ تاریخ سوابق محفوظ می‌ماند."
                >
                  <select
                    aria-label="تقویم"
                    name="calendar"
                    defaultValue={data.calendar || "gregory"}
                  >
                    <option value="gregory">میلادی</option>
                    <option value="persian">هجری شمسی (فارسی)</option>
                  </select>
                </Field>
                <Field
                  label="نام دکان"
                  name="storeName"
                  required
                  defaultValue={data.storeName}
                />
                <Field
                  label="شمارهٔ تماس"
                  name="phone"
                  type="tel"
                  defaultValue={data.phone}
                />
                <Field
                  label="آدرس دکان"
                  name="storeAddress"
                  className="full"
                  defaultValue={data.storeAddress}
                />
                <Field
                  label="واحد پول (کُد ISO)"
                  name="currency"
                  pattern="[A-Z]{3}"
                  required
                  defaultValue={data.currency}
                  hint="پس از نخستین فروش یا رسید، برای حفظ سوابق مالی قابل تغییر نیست."
                />
                <Field
                  label="حد کمبود موجودی (متر)"
                  name="lowStockThreshold"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.001"
                  required
                  defaultValue={data.lowStockThreshold}
                />
                <Field
                  label="عرض پیش‌فرض وینیل (متر)"
                  name="defaultVinylWidth"
                  type="number"
                  min="0.001"
                  max="1000000"
                  step="0.001"
                  required
                  defaultValue={data.defaultVinylWidth}
                />
                <Field label="متن پایانی بل" className="full">
                  <textarea
                    name="invoiceFooter"
                    rows="3"
                    maxLength={500}
                    defaultValue={invoiceFooter(data.invoiceFooter)}
                  />
                </Field>
              </div>
              <ErrorMessage error={error} />
              <div className="form-footer">
                <button disabled={busy} className="primary">
                  {busy ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}
                </button>
              </div>
            </form>
            <aside className="help-card">
              <Settings2 size={28} />
              <h3>معلومات دقیق مهم است.</h3>
              <p>
                معلومات دکان در بل‌ها و صورت‌حساب‌های چاپی مشتریان نمایش داده
                می‌شود.
              </p>
              <hr />
              <p>
                با تغییر حد کمبود موجودی، وضعیت تمام رول‌ها خودکار به‌روز
                می‌شود.
              </p>
            </aside>
          </div>
        )
      )}
    </>
  );
}
