import { useState } from "react";
import { query } from "../services/api";
import { useDebounce, useResource } from "../services/store";
import { ErrorMessage, Pagination, SearchInput } from "./UI";
export default function Lookup({ kind, selected, onSelect }) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [open, setOpen] = useState(!selected);
  const debounced = useDebounce(search);
  const { data, error } = useResource(
    `/${kind}?${query({ search: debounced, page, limit: 5, inStock: kind === "vinyl" ? "true" : undefined })}`,
  );
  return (
    <div className="lookup">
      <div className="lookup-selected">
        <strong>
          {selected
            ? kind === "vinyl"
              ? `#${selected.rollNumber} · ${selected.vinylName}`
              : selected.name
            : kind === "customers"
              ? "مشتری گذری"
              : "یک رول فرش و قالین انتخاب کنید"}
        </strong>
        <button type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "بستن" : "تغییر"}
        </button>
      </div>
      {open && (
        <div className="lookup-results">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={
              kind === "vinyl"
                ? "جستجوی شمارهٔ رول، فرش و قالین یا نوع…"
                : "جستجوی نام یا شمارهٔ تماس…"
            }
          />
          <ErrorMessage error={error} />
          {kind === "customers" && (
            <button
              type="button"
              className="lookup-option"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              مشتری گذری <small>پرداخت کامل ضروری است</small>
            </button>
          )}
          {data?.items.map((item) => (
            <button
              type="button"
              className="lookup-option"
              key={item._id}
              onClick={() => {
                onSelect(item);
                setOpen(false);
              }}
            >
              {kind === "vinyl"
                ? `#${item.rollNumber} · ${item.vinylName}`
                : item.name}
              <small>
                {kind === "vinyl"
                  ? `${item.length} متر موجود · ${item.width} متر عرض`
                  : item.phone}
              </small>
            </button>
          ))}
          {data?.total === 0 && (
            <p className="muted">موردی مطابق جستجو یافت نشد.</p>
          )}
          <Pagination data={data} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
