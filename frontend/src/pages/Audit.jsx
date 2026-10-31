import { useState } from "react";
import { useResource, useStore, useDebounce } from "../services/store";
import {
  PageHeading,
  Table,
  Pagination,
  ErrorMessage,
  Loading,
  Field,
  DateFilter,
} from "../components/UI";
import { ActorIdentity } from "../components/RecordAttribution";
import {
  auditActionLabel,
  auditResources,
  roleLabels,
} from "../../../shared/actors.js";
export default function Audit() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: "",
    role: "",
    resource: "",
    from: "",
    to: "",
  });
  const search = useDebounce(filters.search);
  const params = new URLSearchParams({ ...filters, search, page });
  const { data, error, loading } = useResource(`/audit?${params}`);
  const { date } = useStore();
  const change = (patch) => {
    setFilters((old) => ({ ...old, ...patch }));
    setPage(1);
  };
  return (
    <>
      <PageHeading
        title="تاریخچهٔ فعالیت‌ها"
        description="نام، نام کاربری و نقش مسؤول در زمان انجام هر عملیات ثبت‌شده. فعالیت‌های قبلی بدون نقش محفوظ، با نقش فعلی جایگزین نمی‌شوند."
      />
      <ErrorMessage error={error} />
      <section className="panel">
        <div className="toolbar">
          <Field label="جستجوی کاربر یا رکورد">
            <input
              aria-label="جستجوی کاربر یا رکورد"
              value={filters.search}
              maxLength={200}
              onChange={(e) => change({ search: e.target.value })}
              placeholder="نام، نام کاربری، شمارهٔ بل یا شناسه"
            />
          </Field>
          <Field label="نقش هنگام عملیات">
            <select
              aria-label="نقش هنگام عملیات"
              value={filters.role}
              onChange={(e) => change({ role: e.target.value })}
            >
              <option value="">همهٔ نقش‌ها</option>
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بخش">
            <select
              aria-label="بخش"
              value={filters.resource}
              onChange={(e) => change({ resource: e.target.value })}
            >
              <option value="">همهٔ بخش‌ها</option>
              {Object.entries(auditResources).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <DateFilter from={filters.from} to={filters.to} onChange={change} />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data?.items}
              columns={[
                {
                  key: "date",
                  label: "زمان عملیات",
                  render: (r) =>
                    date(r.date, { hour: "2-digit", minute: "2-digit" }),
                },
                {
                  key: "actorName",
                  label: "مسؤول عملیات",
                  render: (r) => (
                    <ActorIdentity
                      name={r.actorName}
                      username={r.actorUsername}
                      role={r.actorRole}
                    />
                  ),
                },
                {
                  key: "action",
                  label: "عملیات",
                  render: (r) => auditActionLabel(r.action),
                },
                {
                  key: "target",
                  label: "رکورد مرتبط",
                  render: (r) => (
                    <span>
                      {r.targetLabel || "—"}
                      {r.target && (
                        <small className="cell-sub">
                          <bdi dir="ltr">{r.target}</bdi>
                        </small>
                      )}
                    </span>
                  ),
                },
                { key: "details", label: "جزئیات" },
              ]}
            />
            <Pagination data={data} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}
