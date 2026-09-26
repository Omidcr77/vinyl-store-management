import { useState, useRef } from "react";
import { api } from "../services/api";
import { useStore } from "../services/store";
import { Modal, Field, ErrorMessage } from "./UI";
import { formValues, today } from "../utils/format";
export default function PaymentForm({ customer, onClose }) {
  const { money, refresh, notice } = useStore(),
    key = useRef(crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/payments", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: {
          ...formValues(e.currentTarget, ["amount"]),
          customerId: customer._id,
        },
      });
      refresh();
      notice("پرداخت ثبت و باقی‌داری به‌روز شد.");
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title="ثبت پرداخت مشتری" onClose={onClose}>
      <p>
        {customer.name} · باقی‌داری <strong>{money(customer.balance)}</strong>
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="مبلغ"
            name="amount"
            type="number"
            min="0.01"
            max={customer.balance}
            step="0.01"
            required
          />
          <Field
            label="تاریخ پرداخت"
            name="date"
            type="date"
            required
            defaultValue={today()}
          />
          <Field label="روش پرداخت">
            <select name="paymentMethod">
              <option value="cash">نقد</option>
              <option value="bank">بانک</option>
              <option value="other">سایر</option>
            </select>
          </Field>
          <Field label="مرجع (اختیاری)" name="reference" maxLength={200} />
          <Field label="توضیحات" className="full">
            <textarea name="details" rows="3" maxLength={3000} />
          </Field>
        </div>
        <p className="small muted">
          این رسید نخست قدیمی‌ترین بل‌های پرداخت‌نشده را تصفیه می‌کند. تاریخچهٔ
          پرداخت محفوظ می‌ماند.
        </p>
        <ErrorMessage error={error} />
        <div className="form-footer">
          <button type="button" onClick={onClose}>
            انصراف
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "در حال ثبت…" : "ثبت پرداخت"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
