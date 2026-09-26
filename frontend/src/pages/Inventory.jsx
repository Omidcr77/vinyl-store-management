import { Photo } from "../components/ImagePicker";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  SlidersHorizontal,
  Eye,
  Pencil,
  Trash2,
  ShoppingCart,
} from "lucide-react";
import { api, query } from "../services/api";
import { useResource, useDebounce, useStore } from "../services/store";
import {
  PageHeading,
  Table,
  Pagination,
  SearchInput,
  Field,
  Badge,
  Loading,
  ErrorMessage,
  ExportButtons,
  ConfirmDialog,
  Modal,
  DateFilter,
} from "../components/UI";
import { date, number } from "../utils/format";
export default function Inventory() {
  const [url] = useSearchParams(),
    [search, setSearch] = useState(url.get("search") || ""),
    [filters, setFilters] = useState({
      status: url.get("status") || "",
      sort: "rollNumber",
      order: "desc",
    }),
    [page, setPage] = useState(1),
    [showFilters, setShowFilters] = useState(false),
    [view, setView] = useState(null),
    [remove, setRemove] = useState(null);
  const { money, refresh, notice } = useStore(),
    debounced = useDebounce(search),
    params = { ...filters, search: debounced, page };
  const { data, error, loading } = useResource(`/vinyl?${query(params)}`);
  function change(next) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }
  return (
    <>
      <PageHeading
        eyebrow="مدیریت موجودی"
        title="موجودی وینیل"
        description="موجودی هر رول و هر متر را دقیق مدیریت کنید."
      >
        <ExportButtons kind="vinyl" params={params} />
        <Link className="button primary" to="/inventory/new">
          <Plus size={17} /> افزودن رول وینیل
        </Link>
      </PageHeading>
      <section className="panel">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="جستجوی رول، نام، نوع یا رنگ…"
          />
          <div className="actions">
            <select
              aria-label="وضعیت موجودی"
              value={filters.status}
              onChange={(e) => change({ status: e.target.value })}
            >
              <option value="">همهٔ وضعیت‌ها</option>
              <option value="available">موجود</option>
              <option value="low-stock">کم‌موجود</option>
              <option value="sold">تمام‌شده</option>
            </select>
            <button onClick={() => setShowFilters((v) => !v)}>
              <SlidersHorizontal size={16} /> فیلترها
            </button>
          </div>
        </div>
        {showFilters && (
          <div className="filter-grid">
            {["type", "color", "minLength", "maxLength"].map((key) => (
              <Field
                key={key}
                label={
                  {
                    type: "نوع",
                    color: "رنگ",
                    minLength: "کمترین طول (متر)",
                    maxLength: "بیشترین طول (متر)",
                  }[key]
                }
                type={key.includes("طول") ? "number" : "text"}
                min="0"
                value={filters[key] || ""}
                onChange={(e) => change({ [key]: e.target.value })}
              />
            ))}
            <DateFilter {...filters} onChange={change} />
            <Field label="مرتب‌سازی بر اساس">
              <select
                value={filters.sort}
                onChange={(e) => change({ sort: e.target.value })}
              >
                <option value="rollNumber">شمارهٔ رول</option>
                <option value="vinylName">نام وینیل</option>
                <option value="length">طول باقی‌مانده</option>
                <option value="entryDate">تاریخ ورود</option>
                <option value="sellingPrice">نرخ پیشنهادی</option>
              </select>
            </Field>
            <Field label="ترتیب">
              <select
                value={filters.order}
                onChange={(e) => change({ order: e.target.value })}
              >
                <option value="desc">نزولی</option>
                <option value="asc">صعودی</option>
              </select>
            </Field>
            <button
              onClick={() => {
                setFilters({ status: "", sort: "rollNumber", order: "desc" });
                setSearch("");
                setPage(1);
              }}
            >
              پاک‌کردن فیلترها
            </button>
          </div>
        )}
        <ErrorMessage error={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          <Table
            rows={data?.items}
            columns={[
              {
                key: "rollNumber",
                label: "شمارهٔ رول",
                render: (r) => (
                  <strong className="record-link">#{r.rollNumber}</strong>
                ),
              },
              {
                key: "vinylName",
                label: "نام وینیل",
                render: (r) => (
                  <div className="product-cell">
                    <Photo src={r.img} name={r.vinylName} />
                    <strong>{r.vinylName}</strong>
                  </div>
                ),
              },
              { key: "type", label: "نوع" },
              { key: "color", label: "رنگ" },
              {
                key: "length",
                label: "طول",
                render: (r) => `${number(r.length)} متر`,
              },
              {
                key: "width",
                label: "عرض",
                render: (r) => `${number(r.width)} متر`,
              },
              {
                key: "area",
                label: "مساحت",
                render: (r) => `${number(r.length * r.width)} متر مربع`,
              },
              {
                key: "entryDate",
                label: "تاریخ ورود",
                render: (r) => date(r.entryDate),
              },
              {
                key: "status",
                label: "وضعیت",
                render: (r) => <Badge value={r.status} />,
              },
              {
                key: "sellingPrice",
                label: "نرخ پیشنهادی / متر",
                render: (r) =>
                  r.sellingPrice != null ? money(r.sellingPrice) : "—",
              },
              {
                key: "actions",
                label: "عملیات",
                render: (r) => (
                  <div className="row-actions">
                    <button
                      title="مشاهدهٔ رول"
                      aria-label={`مشاهدهٔ رول ${r.rollNumber}`}
                      onClick={() => setView(r)}
                    >
                      <Eye size={15} />
                    </button>
                    <Link
                      title="ویرایش رول"
                      aria-label={`ویرایش رول ${r.rollNumber}`}
                      to={`/inventory/${r._id}/edit`}
                    >
                      <Pencil size={15} />
                    </Link>
                    {r.length > 0 && (
                      <Link
                        title="فروش وینیل"
                        aria-label={`فروش رول ${r.rollNumber}`}
                        to={`/sales/new?vinylId=${r._id}`}
                      >
                        <ShoppingCart size={15} />
                      </Link>
                    )}
                    <button
                      title="بایگانی رول"
                      aria-label={`بایگانی رول ${r.rollNumber}`}
                      onClick={() => setRemove(r)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
        <Pagination data={data} onChange={setPage} />
      </section>
      {view && (
        <Modal
          title={`رول شمارهٔ ${view.rollNumber} · ${view.vinylName}`}
          onClose={() => setView(null)}
        >
          {view.img && <Photo src={view.img} name={view.vinylName} large />}
          <dl className="detail-grid">
            {Object.entries({
              نوع: view.type,
              رنگ: view.color,
              "طول باقی‌مانده": `${view.length} متر`,
              عرض: `${view.width} متر`,
              مساحت: `${number(view.length * view.width)} متر مربع`,
              "تاریخ ورود": date(view.entryDate),
              تهیه‌کننده: view.supplier || "—",
              "قیمت خرید / متر طولی":
                view.costPrice == null ? "—" : money(view.costPrice),
              "نرخ پیشنهادی / متر طولی":
                view.sellingPrice == null ? "—" : money(view.sellingPrice),
              توضیحات: view.details || "—",
            }).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="form-footer">
            <Link className="button" to={`/inventory/${view._id}/edit`}>
              ویرایش رول
            </Link>
            {view.length > 0 && (
              <Link
                className="button primary"
                to={`/sales/new?vinylId=${view._id}`}
              >
                فروش از این رول
              </Link>
            )}
          </div>
        </Modal>
      )}
      {remove && (
        <ConfirmDialog
          title={`بایگانی رول شمارهٔ ${remove.rollNumber}?`}
          message="رول از موجودی فعال خارج می‌شود. رول‌های دارای سابقهٔ فروش قابل بایگانی نیستند و سوابق آن‌ها محفوظ می‌ماند."
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api(`/vinyl/${remove._id}`, { method: "DELETE" });
            refresh();
            notice("رول بایگانی شد.");
          }}
        />
      )}
    </>
  );
}
