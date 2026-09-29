import { randomUUID } from "../utils/uuid";
import { useState, useRef } from "react";
import { api } from "../services/api";
import { useStore } from "../services/store";
import { Modal, Field, ErrorMessage } from "./UI";
import { formValues, today } from "../utils/format";
export default function PaymentForm({ customer, onClose }) {
  const { money, refresh, notice } = useStore(),
    key = useRef(randomUUID()),
    [busy, setBusy] = useState(false),
    [amount, setAmount] = useState(""),
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
      notice("رسید ثبت و حساب مشتری به‌روز شد.");
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title="ثبت رسید مشتری" onClose={onClose}>
      <p>
        {customer.name} · {customer.balance < 0 ? "طلب مشتری" : "باقی‌داری"}{" "}
        <strong>{money(Math.abs(customer.balance))}</strong>
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="مبلغ"
            name="amount"
            type="number"
            min="0.01"
            max="100000000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            required
          />
          <Field
            label="تاریخ رسید"
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
          این رسید نخست قدیمی‌ترین بل‌های پرداخت‌نشده را تصفیه می‌کند. مبلغ
          اضافی به‌عنوان طلب مشتری ذخیره و در خرید بعدی استفاده می‌شود.
        </p>
        {Number(amount) > 0 && (
          <p role="status">
            {customer.balance - Number(amount) < 0
              ? "طلب مشتری پس از رسید"
              : "باقی‌داری پس از رسید"}
            :{" "}
            <strong>
              {money(
                Math.abs(
                  (Math.round(customer.balance * 100) -
                    Math.round(Number(amount) * 100)) /
                    100,
                ),
              )}
            </strong>
          </p>
        )}
        <ErrorMessage error={error} />
        <div className="form-footer">
          <button type="button" onClick={onClose}>
            انصراف
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "در حال ثبت…" : "ثبت رسید"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
