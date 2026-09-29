import { useState } from "react";
import { Link } from "react-router-dom";
import Lookup from "./Lookup";
export default function SupplierPicker({
  defaultId,
  defaultName,
  onChange,
  disabled = false,
}) {
  const [selected, setSelected] = useState(
    defaultId ? { _id: defaultId, name: defaultName } : null,
  );
  const select = (value) => {
    setSelected(value);
    onChange?.(value);
  };
  return (
    <div className="field full">
      <span>حساب تهیه‌کننده</span>
      <input type="hidden" name="supplierId" value={selected?._id || ""} />
      {disabled ? (
        <strong>{selected?.name || "بدون حساب مرتبط"}</strong>
      ) : (
        <>
          <Lookup kind="suppliers" selected={selected} onSelect={select} />
          {selected && (
            <button type="button" onClick={() => select(null)}>
              پاک‌کردن انتخاب تهیه‌کننده
            </button>
          )}
          <small>
            خرید به حساب این تهیه‌کننده اضافه می‌شود.{" "}
            <Link to="/suppliers">مدیریت تهیه‌کنندگان</Link>
          </small>
        </>
      )}
    </div>
  );
}
