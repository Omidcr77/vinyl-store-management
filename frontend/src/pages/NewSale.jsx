import { randomUUID } from "../utils/uuid";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import Decimal from "decimal.js";
import { api } from "../services/api";
import { useStore } from "../services/store";
import Lookup from "../components/Lookup";
import SaleLine, { lineTotal } from "../components/SaleLine";
import { Modal, Field, ErrorMessage, Loading } from "../components/UI";
import { number, today } from "../utils/format";
const blank = () => ({
  id: randomUUID(),
  roll: null,
  length: "",
  price: "",
  method: "linear",
  rememberPrice: false,
  pricingLoading: false,
});
export default function NewSale({ onClose }) {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    { money, refresh, notice } = useStore();
  const [items, setItems] = useState(() => [blank()]),
    [customer, setCustomer] = useState(null),
    [paid, setPaid] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const key = useRef(randomUUID());
  const update = useCallback(
    (id, changes) =>
      setItems((rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...changes } : r)),
      ),
    [],
  );
  useEffect(() => {
    let active = true;
    Promise.all([
      params.get("vinylId")
        ? api(`/vinyl/${params.get("vinylId")}`).then((roll) => {
            if (active) setItems((rows) => [{ ...rows[0], roll }]);
          })
        : null,
      params.get("customerId")
        ? api(`/customers/${params.get("customerId")}`).then((r) => {
            if (active) setCustomer(r.customer);
          })
        : null,
    ])
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [params]);
  const total = items
    .reduce((n, r) => n.plus(lineTotal(r)), new Decimal(0))
    .toNumber();
  const area = items
    .reduce(
      (n, r) => n.plus(new Decimal(r.length || 0).times(r.roll?.width || 0)),
      new Decimal(0),
    )
    .toNumber();
  const length = items
    .reduce((n, r) => n.plus(r.length || 0), new Decimal(0))
    .toNumber();
  const unpaid = new Decimal(total).minus(paid || 0).toNumber();
  const creditApplied = Math.min(
    Math.max(0, unpaid),
    Math.max(0, -(customer?.balance || 0)),
  );
  const due = new Decimal(unpaid).minus(creditApplied).toNumber();
  const availableFor = (row) =>
    Math.max(
      0,
      new Decimal(row.roll?.length || 0)
        .minus(
          items
            .filter((r) => r.id !== row.id && r.roll?._id === row.roll?._id)
            .reduce((sum, r) => sum.plus(r.length || 0), new Decimal(0)),
        )
        .toNumber(),
    );
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (items.some((r) => !r.roll))
      return setError("برای هر جنس یک رول را انتخاب کنید.");
    const invalid = items.find((r) => Number(r.length) > availableFor(r));
    if (invalid)
      return setError(
        `طول انتخاب‌شده از موجودی رول شمارهٔ ${invalid.roll.rollNumber} بیشتر است.`,
      );
    if (items.some((r) => r.pricingLoading)) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const sale = await api("/sales", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: {
          ...(customer ? { customerId: customer._id } : {}),
          items: items.map((r) => ({
            vinylId: r.roll._id,
            soldLength: Number(r.length),
            pricingMethod: r.method,
            unitPrice: Number(r.price),
            rememberPrice: Boolean(customer && r.rememberPrice),
          })),
          paidAmount: Number(paid || 0),
          soldDate: form.get("soldDate"),
          notes: form.get("notes"),
        },
      });
      refresh();
      notice("فروش تکمیل شد. موجودی و باقی‌داری به‌روز گردید.");
      navigate(`/sales/${sale._id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="فروش جدید"
      className="sale-modal"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!ready ? (
        <Loading />
      ) : (
        <form onSubmit={submit}>
          <fieldset className="sale-fieldset" disabled={busy}>
            <div className="sale-layout">
              <div className="sale-fields">
                <section className="panel form-panel">
                  <h2>
                    <span className="step">1</span> مشتری
                  </h2>
                  <Lookup
                    kind="customers"
                    selected={customer}
                    onSelect={setCustomer}
                  />
                  <p className="muted">
                    برای فروش قرضی، انتخاب مشتری ضروری است.{" "}
                    <Link to="/customers" className="text-link">
                      افزودن مشتری
                    </Link>
                  </p>
                </section>
                <div className="sale-items-heading">
                  <h2>
                    <span className="step">2</span> اجناس بل
                  </h2>
                  <p className="muted">
                    هر رول را جدا انتخاب کنید؛ همهٔ اجناس در یک بل ثبت می‌شوند.
                  </p>
                </div>
                {items.map((row, index) => (
                  <SaleLine
                    key={row.id}
                    value={row}
                    index={index}
                    customer={customer}
                    onChange={update}
                    removable={items.length > 1}
                    onRemove={() =>
                      setItems((rows) => rows.filter((r) => r.id !== row.id))
                    }
                    available={availableFor(row)}
                  />
                ))}
                <button
                  type="button"
                  className="button sale-add-item"
                  disabled={items.length >= 100}
                  onClick={() => setItems((rows) => [...rows, blank()])}
                >
                  <Plus size={18} />
                  افزودن جنس دیگر
                </button>
                <section className="panel form-panel">
                  <h2>
                    <span className="step">3</span> پرداخت بل
                  </h2>
                  <div className="form-grid">
                    <Field
                      label="مبلغ پرداخت‌شده"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      max={total || undefined}
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                    />
                    <div className="field">
                      <span>گزینهٔ سریع</span>
                      <button
                        type="button"
                        onClick={() => setPaid(String(total))}
                      >
                        پرداخت کامل
                      </button>
                    </div>
                    <Field
                      label="تاریخ فروش"
                      name="soldDate"
                      type="date"
                      required
                      defaultValue={today()}
                    />
                    <Field label="یادداشت‌ها (اختیاری)" className="full">
                      <textarea name="notes" rows="2" maxLength={3000} />
                    </Field>
                  </div>
                </section>
              </div>
              <aside className="panel sale-summary">
                <span className="eyebrow">خلاصهٔ فروش</span>
                <h2>یک بل برای {number(items.length)} جنس</h2>
                <p>{customer?.name || "مشتری گذری"}</p>
                <dl>
                  {items.map((r, i) => (
                    <div key={r.id}>
                      <dt>
                        {r.roll?.vinylName || `جنس ${i + 1}`}
                        {r.roll && (
                          <small className="cell-sub">
                            رول {number(r.roll.rollNumber)} · {number(r.length)}{" "}
                            متر
                          </small>
                        )}
                      </dt>
                      <dd>{money(lineTotal(r))}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>مجموع طول</dt>
                    <dd>{number(length)} متر</dd>
                  </div>
                  <div>
                    <dt>مساحت مجموعی</dt>
                    <dd>{number(area)} متر مربع</dd>
                  </div>
                </dl>
                <div className="sale-total">
                  <span>مبلغ مجموعی</span>
                  <strong>{money(total)}</strong>
                </div>
                <dl>
                  <div>
                    <dt>مبلغ پرداخت‌شده</dt>
                    <dd>{money(paid)}</dd>
                  </div>
                  {customer?.balance < 0 && (
                    <>
                      <div>
                        <dt>طلب موجود مشتری</dt>
                        <dd>{money(-customer.balance)}</dd>
                      </div>
                      <div>
                        <dt>استفاده از طلب مشتری</dt>
                        <dd>{money(creditApplied)}</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>باقی‌داری</dt>
                    <dd className={due > 0 ? "debt" : ""}>{money(due)}</dd>
                  </div>
                </dl>
                <ErrorMessage error={error} />
                <button
                  className="primary wide"
                  disabled={
                    busy || items.some((r) => !r.roll || r.pricingLoading)
                  }
                >
                  {busy ? (
                    "در حال ثبت فروش…"
                  ) : (
                    <>
                      <Check size={17} />
                      تکمیل فروش
                    </>
                  )}
                </button>
                <p className="small muted">
                  تمام اجناس، پرداخت و باقی‌داری مشتری یک‌جا ثبت می‌شوند.
                </p>
                <button
                  type="button"
                  className="wide"
                  disabled={busy}
                  onClick={onClose}
                >
                  انصراف
                </button>
              </aside>
            </div>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
