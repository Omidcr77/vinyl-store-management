import { useEffect, useState } from "react";
import { useAuth } from "../services/auth";
import { useStore } from "../services/store";
import { api } from "../services/api";
import { ConfirmDialog } from "./UI";
import DeleteIcon from "./DeleteIcon";

export function useBulkDelete(kind, rows = [], scope, onDeleted) {
  const { canManage } = useAuth();
  const { refresh, notice } = useStore();
  const [selected, setSelected] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    setSelected([]);
    setSelecting(false);
    setPending(null);
  }, [scope]);
  const visible = selected.filter((id) => rows.some((row) => row._id === id));
  const all = rows.length > 0 && visible.length === rows.length;
  const label = (row) => row.name || row.billNumber || `رول ${row.rollNumber}`;
  const select = (row) => (
    <input
      type="checkbox"
      aria-label={`انتخاب ${label(row)}`}
      checked={visible.includes(row._id)}
      onChange={(e) =>
        setSelected((ids) =>
          e.target.checked
            ? [...ids, row._id]
            : ids.filter((id) => id !== row._id),
        )
      }
    />
  );
  return {
    selectionColumns:
      canManage && selecting
        ? [{ key: "selection", label: "انتخاب", render: select }]
        : [],
    deleteColumns: canManage
      ? [
          {
            key: "actions",
            label: "عملیات",
            render: (row) => (
              <button
                aria-label={`حذف ${label(row)}`}
                onClick={() => setPending([row._id])}
              >
                <DeleteIcon /> حذف
              </button>
            ),
          },
        ]
      : [],
    toolbar: canManage && (
      <div className="bulk-actions">
        <button
          type="button"
          aria-pressed={selecting}
          disabled={!rows.length && !selecting}
          onClick={() => {
            setSelecting((value) => !value);
            setSelected([]);
          }}
        >
          {selecting ? "لغو انتخاب" : "انتخاب چند مورد"}
        </button>
        <label>
          <input
            type="checkbox"
            aria-label="انتخاب همهٔ این صفحه"
            checked={all}
            disabled={!rows.length}
            ref={(node) => {
              if (node) node.indeterminate = visible.length > 0 && !all;
            }}
            onChange={(e) => {
              setSelecting(true);
              setSelected(e.target.checked ? rows.map((row) => row._id) : []);
            }}
          />{" "}
          انتخاب همهٔ این صفحه
        </label>
        {visible.length > 0 && (
          <>
            <span role="status">{visible.length} مورد انتخاب شده</span>
            <button
              type="button"
              className="danger"
              onClick={() => setPending(visible)}
            >
              <DeleteIcon /> حذف انتخاب‌شده‌ها
            </button>
          </>
        )}
      </div>
    ),
    dialog: canManage && pending && (
      <ConfirmDialog
        title={`حذف ${pending.length} مورد؟`}
        confirmLabel="تأیید حذف"
        message={
          kind === "sales"
            ? "فروش‌های انتخاب‌شده حذف و طول فروخته‌شده به موجودی برگردانده می‌شود. پرداخت هنگام فروش نیز لغو می‌شود؛ رسیدهای جداگانه محفوظ می‌مانند و حساب مشتری اصلاح می‌شود. پول نقد به‌صورت خودکار بازپرداخت نمی‌شود."
            : kind === "customers"
              ? "مشتریان انتخاب‌شده از فهرست فعال حذف می‌شوند. حساب، فروشات و رسیدهای قبلی آن‌ها محفوظ می‌ماند."
              : "رکوردهای انتخاب‌شده از موجودی فعال خارج می‌شوند. اگر یک رول سابقهٔ فروش داشته باشد، هیچ‌کدام حذف نمی‌شوند؛ نخست فروش مربوط را حذف کنید."
        }
        onClose={() => setPending(null)}
        onConfirm={async () => {
          await api(`/${kind}/bulk-delete`, {
            method: "POST",
            body: { ids: pending },
          });
          setSelected([]);
          setSelecting(false);
          onDeleted?.();
          refresh();
          notice(`${pending.length} مورد حذف شد.`);
        }}
      />
    ),
  };
}
