import { useBulkDelete } from "../components/BulkDelete";
import { Photo } from "../components/ImagePicker";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight } from "lucide-react";
import { query } from "../services/api";
import { useResource, useDebounce, useStore } from "../services/store";
import {
  PageHeading,
  SearchInput,
  Table,
  Pagination,
  ErrorMessage,
  Loading,
  ExportButtons,
} from "../components/UI";
import CustomerForm from "../components/CustomerForm";
import ViewControls, { useRecordView } from "../components/ViewControls";
export default function Customers() {
  const [recordView, setRecordView] = useRecordView("customers");
  const [search, setSearch] = useState(""),
    [hasBalance, setHasBalance] = useState(""),
    [archived, setArchived] = useState(""),
    [page, setPage] = useState(1),
    [add, setAdd] = useState(false),
    { money } = useStore();
  const debounced = useDebounce(search),
    params = { search: debounced, hasBalance, archived, page, order: "asc" },
    { data, error, loading } = useResource(`/customers?${query(params)}`);
  const bulk = useBulkDelete("customers", data?.items, query(params), () =>
    setPage(1),
  );
  return (
    <>
      <PageHeading
        eyebrow="مدیریت مشتریان"
        title="مشتریان"
        description="معلومات و حساب‌های مشتریان را منظم نگه دارید."
      >
        <ExportButtons kind="customers" params={params} />
        <button className="primary" onClick={() => setAdd(true)}>
          <Plus size={17} /> افزودن مشتری
        </button>
      </PageHeading>
      <section className="panel">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="جستجوی نام یا شمارهٔ تماس مشتری…"
          />
          <select
            aria-label="وضعیت مشتری"
            value={archived}
            onChange={(e) => {
              setArchived(e.target.value);
              setPage(1);
            }}
          >
            <option value="">مشتریان فعال</option>
            <option value="true">مشتریان حذف‌شده</option>
            <option value="all">همهٔ مشتریان</option>
          </select>
          <select
            aria-label="فیلتر باقی‌داری مشتری"
            value={hasBalance}
            onChange={(e) => {
              setHasBalance(e.target.value);
              setPage(1);
            }}
          >
            <option value="">همهٔ مشتریان</option>
            <option value="true">مشتریان دارای باقی‌داری</option>
            <option value="credit">مشتریان دارای طلب</option>
          </select>
        </div>
        <ErrorMessage error={error} />
        {bulk.toolbar}
        <div className="record-view-bar">
          <ViewControls value={recordView} onChange={setRecordView} />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <Table
            view={recordView}
            rows={data?.items}
            columns={[
              ...bulk.selectionColumns,
              {
                key: "name",
                label: "مشتری",
                render: (r) => (
                  <Link className="customer-cell" to={`/customers/${r._id}`}>
                    <Photo src={r.img} name={r.name} />
                    <strong>{r.name}</strong>
                  </Link>
                ),
              },
              { key: "phone", label: "شمارهٔ تماس" },
              { key: "address", label: "آدرس" },
              {
                key: "balance",
                label: "باقی‌داری / طلب",
                render: (r) => (
                  <strong className={r.balance > 0 ? "debt" : ""}>
                    {money(Math.abs(r.balance))}
                    {r.balance < 0 ? " طلب مشتری" : ""}
                  </strong>
                ),
              },
              {
                key: "account",
                label: "حساب",
                render: (r) => (
                  <Link className="text-link" to={`/customers/${r._id}`}>
                    مشاهدهٔ حساب <ArrowUpRight size={16} />
                  </Link>
                ),
              },
              ...bulk.deleteColumns,
            ]}
          />
        )}
        <Pagination data={data} onChange={setPage} />
      </section>
      {bulk.dialog}
      {add && <CustomerForm onClose={() => setAdd(false)} />}
    </>
  );
}
