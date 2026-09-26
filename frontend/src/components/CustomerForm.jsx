import ImagePicker from "./ImagePicker";
import { useState } from "react";
import { api } from "../services/api";
import { useStore } from "../services/store";
import { Modal, Field, ErrorMessage } from "./UI";
import { formValues } from "../utils/format";
export default function CustomerForm({ customer, onClose }) {
  const { refresh, notice } = useStore(),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(customer ? `/customers/${customer._id}` : "/customers", {
        method: customer ? "PUT" : "POST",
        body: formValues(e.currentTarget),
      });
      refresh();
      notice(customer ? "معلومات مشتری به‌روز شد." : "مشتری افزوده شد.");
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={customer ? "ویرایش مشتری" : "افزودن مشتری"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="نام مکمل"
            name="name"
            required
            defaultValue={customer?.name}
            maxLength={200}
          />
          <Field
            label="شمارهٔ تماس"
            name="phone"
            required
            type="tel"
            defaultValue={customer?.phone}
            maxLength={200}
          />
          <Field
            label="آدرس"
            name="address"
            className="full"
            defaultValue={customer?.address}
            maxLength={500}
          />
          <ImagePicker defaultValue={customer?.img} onBusy={setUploading} />
        </div>
        <ErrorMessage error={error} />
        <div className="form-footer">
          <button type="button" onClick={onClose}>
            انصراف
          </button>
          <button className="primary" disabled={busy || uploading}>
            {busy ? "در حال ذخیره…" : "ذخیرهٔ مشتری"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
