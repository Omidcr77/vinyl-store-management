import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { api, query } from "../services/api";
import { useStore } from "../services/store";
import Lookup from "../components/Lookup";
import { PageHeading, Field, ErrorMessage, BackLink } from "../components/UI";
import { number, today } from "../utils/format";
import Decimal from "decimal.js";
export default function NewSale() {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    { money, refresh, notice } = useStore();
  const [roll, setRoll] = useState(null),
    [customer, setCustomer] = useState(null),
    [length, setLength] = useState(""),
    [price, setPrice] = useState(""),
    [method, setMethod] = useState("linear"),
    [paid, setPaid] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [rememberPrice, setRememberPrice] = useState(false);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [priceSource, setPriceSource] = useState("");
  const [priceError, setPriceError] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    Promise.all([
      params.get("vinylId")
        ? api(`/vinyl/${params.get("vinylId")}`).then((r) => {
            setRoll(r);
          })
        : null,
      params.get("customerId")
        ? api(`/customers/${params.get("customerId")}`).then((r) =>
            setCustomer(r.customer),
          )
        : null,
    ])
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, [params]);
  useEffect(() => {
    let active = true;
    setRememberPrice(false);
    setPriceError("");
    setPrice("");
    if (!roll) {
      setPricingLoading(false);
      return;
    }
    const fallback = method === "linear" ? (roll.sellingPrice ?? "") : "";
    const fallbackSource =
      fallback === ""
        ? "نرخ این فروش را وارد کنید."
        : "نرخ پیشنهادی رول؛ می‌توانید آن را برای این مشتری تغییر دهید.";
    setPrice(fallback);
    setPriceSource(fallbackSource);
    if (!customer) {
      setPricingLoading(false);
      return;
    }
    setPricingLoading(true);
    api(
      `/customers/${customer._id}/prices?${query({ type: roll.type, pricingMethod: method, limit: 1 })}`,
    )
      .then((result) => {
        if (!active) return;
        if (result.items[0]) {
          setPrice(result.items[0].unitPrice);
          setPriceSource(
            `نرخ ذخیره‌شدهٔ ${customer.name} برای نوع «${roll.type}». قابل تغییر برای این فروش است.`,
          );
        }
      })
      .catch(() => {
        if (active)
          setPriceError(
            "نرخ ذخیره‌شده دریافت نشد. نرخ را بررسی کرده یا دستی وارد کنید.",
          );
      })
      .finally(() => {
        if (active) setPricingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customer?._id, roll?._id, method]);
  const area = new Decimal(length || 0).times(roll?.width || 0).toNumber(),
    total = new Decimal(method === "area" ? area : length || 0)
      .times(price || 0)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber(),
    due = new Decimal(total).minus(paid || 0).toNumber();
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!roll) return setError("نخست یک رول وینیل را انتخاب کنید.");
    if (Number(length) > roll.length)
      return setError(
        `فقط ${roll.length} متر در رول شمارهٔ ${roll.rollNumber} باقی مانده است.`,
      );
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const sale = await api("/sales", {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: {
          vinylId: roll._id,
          ...(customer ? { customerId: customer._id } : {}),
          soldLength: Number(length),
          pricingMethod: method,
          unitPrice: Number(price),
          paidAmount: Number(paid || 0),
          soldDate: form.get("soldDate"),
          notes: form.get("notes"),
          rememberPrice: Boolean(customer && rememberPrice),
        },
      });
      refresh();
      notice("فروش تکمیل شد. موجودی و باقی‌داری به‌روز گردید.");
      navigate(`/sales/${sale._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <>
      <BackLink to="/sales">برگشت به فروشات</BackLink>
      <PageHeading
        eyebrow="ثبت فروش"
        title="ثبت فروش جدید"
        description="رول را انتخاب کنید، طول مورد نیاز و نرخ مشتری را وارد کنید و فروش را ثبت نمایید."
      />
      {ready && (
        <form onSubmit={submit}>
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
              <section className="panel form-panel">
                <h2>
                  <span className="step">2</span> وینیل و ابعاد
                </h2>
                <Lookup
                  kind="vinyl"
                  selected={roll}
                  onSelect={(r) => {
                    setRoll(r);
                    setMethod("linear");
                  }}
                />
                {roll && (
                  <div className="roll-info">
                    <span>
                      {roll.type} · {roll.color}
                    </span>
                    <strong>{number(roll.length)} متر موجود</strong>
                    <span>{number(roll.width)} متر عرض</span>
                  </div>
                )}
                <div className="form-grid">
                  <Field
                    label="طول فروخته‌شده (متر)"
                    name="soldLength"
                    type="number"
                    min="0.001"
                    step="0.001"
                    max={roll?.length || 1000000}
                    required
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                  />
                  <Field label="روش قیمت‌گذاری">
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      <option value="linear">فی متر طولی</option>
                      <option value="area">فی متر مربع</option>
                    </select>
                  </Field>
                  <Field
                    label={
                      method === "area"
                        ? "نرخ مشتری فی متر مربع"
                        : "نرخ مشتری فی متر طولی"
                    }
                    type="number"
                    required
                    min="0.01"
                    max="100000000"
                    step="0.01"
                    value={price}
                    disabled={pricingLoading}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setPriceSource("نرخ واردشده برای این فروش.");
                    }}
                    hint={
                      pricingLoading ? "در حال دریافت نرخ مشتری…" : priceSource
                    }
                  />
                  <Field
                    label="تاریخ فروش"
                    name="soldDate"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </div>
                <ErrorMessage error={priceError} />
                {customer && (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={rememberPrice}
                      onChange={(e) => setRememberPrice(e.target.checked)}
                    />
                    ذخیرهٔ این نرخ برای این مشتری و این نوع وینیل
                  </label>
                )}
              </section>
              <section className="panel form-panel">
                <h2>
                  <span className="step">3</span> پرداخت
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
                  <Field label="یادداشت‌ها (اختیاری)" className="full">
                    <textarea name="notes" rows="2" maxLength={3000} />
                  </Field>
                </div>
              </section>
            </div>
            <aside className="panel sale-summary">
              <span className="eyebrow">خلاصهٔ فروش</span>
              <h2>{roll?.vinylName || "فروش جدید شما"}</h2>
              <p>{customer?.name || "مشتری گذری"}</p>
              <dl>
                <div>
                  <dt>طول برش</dt>
                  <dd>{number(length)} متر</dd>
                </div>
                <div>
                  <dt>عرض</dt>
                  <dd>{number(roll?.width)} متر</dd>
                </div>
                <div>
                  <dt>مساحت مجموعی</dt>
                  <dd>{number(area)} متر مربع</dd>
                </div>
                <div>
                  <dt>موجودی پس از فروش</dt>
                  <dd>
                    {number(Math.max(0, (roll?.length || 0) - Number(length)))}{" "}
                    متر
                  </dd>
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
                <div>
                  <dt>باقی‌داری</dt>
                  <dd className={due > 0 ? "debt" : ""}>{money(due)}</dd>
                </div>
              </dl>
              <ErrorMessage error={error} />
              <button
                className="primary wide"
                disabled={busy || !roll || pricingLoading}
              >
                {busy ? (
                  "در حال ثبت فروش…"
                ) : (
                  <>
                    <Check size={17} /> تکمیل فروش
                  </>
                )}
              </button>
              <p className="small muted">
                با تکمیل فروش، موجودی و باقی‌داری مشتری همزمان به‌روز می‌شوند.
              </p>
            </aside>
          </div>
        </form>
      )}
    </>
  );
}
