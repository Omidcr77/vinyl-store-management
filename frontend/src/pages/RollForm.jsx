import { randomUUID } from "../utils/uuid";
import SupplierPicker from "../components/SupplierPicker";
import ImagePicker from "../components/ImagePicker";
import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layers3 } from "lucide-react";
import { api } from "../services/api";
import { useResource, useStore } from "../services/store";
import {
  PageHeading,
  Field,
  ErrorMessage,
  Loading,
  BackLink,
  Modal,
} from "../components/UI";
import { formValues, today } from "../utils/format";
export default function RollForm({ onClose }) {
  const { id } = useParams(),
    navigate = useNavigate(),
    { settings, refresh, notice } = useStore();
  const {
    data,
    loading,
    error: loadError,
  } = useResource(id ? `/vinyl/${id}` : "/settings");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const key = useRef(randomUUID());
  const roll = id ? data : {};
  const close = onClose || (() => navigate("/inventory"));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const values = formValues(e.currentTarget, [
        "length",
        "width",
        "costPrice",
        "importCost",
        "paidAmount",
        "sellingPrice",
      ]);
      if (!values.supplierId) delete values.supplierId;
      await api(id ? `/vinyl/${id}` : "/vinyl", {
        method: id ? "PUT" : "POST",
        headers: { "Idempotency-Key": key.current },
        body: values,
      });
      refresh();
      notice(id ? "مشخصات رول به‌روز شد." : "رکورد جدید افزوده شد.");
      close();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  const content = (
    <>
      {!onClose && (
        <>
          <BackLink to="/inventory">برگشت به موجودی</BackLink>
          <PageHeading
            eyebrow="موجودی"
            title={id ? "ویرایش رول فرش و قالین" : "افزودن رکورد"}
            description="مشخصات رول را وارد کنید. شمارهٔ رول خودکار تعیین می‌شود."
          />
        </>
      )}
      <ErrorMessage error={loadError} />
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <div className={onClose ? "record-popup" : "form-layout"}>
            <form
              className={onClose ? "" : "panel form-panel"}
              onSubmit={submit}
              key={id || "new"}
            >
              <h2>مشخصات رول</h2>
              <p className="muted">
                {id
                  ? `رول شمارهٔ ${roll.rollNumber}`
                  : "شمارهٔ رول هنگام ذخیره خودکار تعیین می‌شود."}
              </p>
              <div className="form-grid">
                <ImagePicker defaultValue={roll.img} onBusy={setUploading} />
                <Field
                  label="نام فرش و قالین"
                  name="vinylName"
                  required
                  defaultValue={roll.vinylName}
                  placeholder="مثلاً بلوط ترکی"
                  maxLength={200}
                />
                <Field
                  label="نوع"
                  name="type"
                  required
                  defaultValue={roll.type}
                  placeholder="مثلاً چوبی"
                  maxLength={200}
                />
                <Field
                  label="رنگ"
                  name="color"
                  required
                  defaultValue={roll.color}
                  placeholder="مثلاً رنگ بلوط طبیعی"
                  maxLength={200}
                />
                <Field
                  label="تاریخ ورود"
                  name="entryDate"
                  type="date"
                  required
                  defaultValue={roll.entryDate?.slice(0, 10) || today()}
                />
                <Field
                  label="طول (متر)"
                  name="length"
                  type="number"
                  step="0.001"
                  min={id && roll.length === 0 ? 0 : 0.001}
                  max="1000000"
                  required
                  defaultValue={roll.length}
                />
                <Field
                  label="عرض (متر)"
                  name="width"
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="1000000"
                  required
                  defaultValue={roll.width || settings?.defaultVinylWidth || 4}
                />
                <Field
                  label={`قیمت خرید فی متر طولی (${settings?.currency || "USD"})`}
                  name="costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={roll.costPrice}
                />
                <Field
                  label={`نرخ پیشنهادی فی متر طولی (${settings?.currency || "USD"})`}
                  name="sellingPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={roll.sellingPrice}
                />
                <Field
                  label={`هزینهٔ حمل و ورود این رول (${settings?.currency || "USD"})`}
                  name="importCost"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100000000"
                  defaultValue={roll.importCost || 0}
                  hint="مجموع هزینهٔ همین رول؛ جدا از مبلغ پرداختی به شرکت."
                />
                <SupplierPicker
                  defaultId={roll.supplierId}
                  defaultName={roll.supplier}
                  disabled={Boolean(id)}
                />
                {!id && (
                  <Field
                    label="پرداخت اولیه به تهیه‌کننده"
                    name="paidAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    max="100000000"
                    defaultValue="0"
                    hint="برای خرید قرضی صفر بگذارید. پرداخت اضافی به طلب شما تبدیل می‌شود."
                  />
                )}
                <Field
                  label="تهیه‌کننده"
                  name="supplier"
                  defaultValue={roll.supplier}
                />
                <Field label="توضیحات">
                  <textarea
                    name="details"
                    rows="3"
                    maxLength={3000}
                    defaultValue={roll.details}
                  />
                </Field>
              </div>
              <ErrorMessage error={error} />
              <div className="form-footer">
                <button type="button" onClick={close}>
                  انصراف
                </button>
                <button className="primary" disabled={busy || uploading}>
                  {busy
                    ? "در حال ذخیره…"
                    : id
                      ? "ذخیرهٔ تغییرات"
                      : "افزودن رکورد"}
                </button>
              </div>
            </form>
            {!onClose && (
              <aside className="help-card">
                <Layers3 size={28} />
                <h3>هر رول با طول باقی‌مانده محفوظ می‌ماند.</h3>
                <p>
                  تنها طول مورد نیاز مشتری را بفروشید. طول باقی‌مانده و وضعیت
                  موجودی پس از هر فروش خودکار به‌روز می‌شود.
                </p>
                <hr />
                <p>
                  نرخ رول تنها پیشنهاد اولیه است. هنگام فروش، نرخ اختصاصی مشتری
                  را فی متر طولی یا متر مربع تعیین کنید.
                </p>
                {id && (
                  <p>
                    پس از فروش، ابعاد رول قابل تغییر نیست. جنس تازه را به‌عنوان
                    رول جدید ثبت کنید.
                  </p>
                )}
              </aside>
            )}
          </div>
        )
      )}
    </>
  );
  return onClose ? (
    <Modal title="افزودن رکورد" onClose={close}>
      {content}
    </Modal>
  ) : (
    content
  );
}
