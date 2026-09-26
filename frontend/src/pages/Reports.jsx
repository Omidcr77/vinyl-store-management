import { useState } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { allRecords, query } from "../services/api";
import { useResource, useStore } from "../services/store";
import {
  PageHeading,
  SummaryCard,
  Table,
  Pagination,
  DateFilter,
  ErrorMessage,
  Loading,
  ExportButtons,
} from "../components/UI";
import SaleTable from "../components/SaleTable";
import PrintDocument from "../components/PrintDocument";
import { number, today } from "../utils/format";
function rangeFor(preset) {
  const d = new Date(),
    end = today();
  if (preset === "all") return {};
  if (preset === "today") return { from: end, to: end };
  if (preset === "yesterday") d.setDate(d.getDate() - 1);
  if (preset === "week") d.setDate(d.getDate() - 6);
  if (preset === "month") d.setDate(1);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from, to: preset === "yesterday" ? from : end };
}
export default function Reports() {
  const [kind, setKind] = useState("sales"),
    [range, setRange] = useState(rangeFor("month")),
    [preset, setPreset] = useState("month"),
    [page, setPage] = useState(1),
    [print, setPrint] = useState(null),
    [busy, setBusy] = useState(false),
    [printError, setPrintError] = useState(""),
    { money } = useStore();
  const params = {
      ...(kind === "sales" ? range : {}),
      ...(kind === "customers" ? { hasBalance: "true" } : {}),
      page,
    },
    { data, loading, error } = useResource(`/reports/${kind}?${query(params)}`),
    summary = data?.summary;
  async function printReport() {
    setBusy(true);
    try {
      const sales = await allRecords("/sales", range);
      setPrint(sales);
    } catch (e) {
      setPrintError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="گزارش‌های دکان"
        title="گزارش‌ها"
        description="آمار واقعی برای تصمیم‌گیری روزانهٔ شما."
      >
        <ExportButtons
          kind={kind === "inventory" ? "vinyl" : kind}
          params={params}
        />
        {kind === "sales" && (
          <button disabled={busy || !data} onClick={printReport}>
            <Printer size={16} />
            {busy ? "در حال آماده‌سازی…" : "چاپ گزارش"}
          </button>
        )}
      </PageHeading>
      <div className="tabs">
        {[
          ["sales", "گزارش فروشات"],
          ["inventory", "گزارش موجودی"],
          ["customers", "باقی‌داری مشتریان"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={kind === key ? "active" : ""}
            onClick={() => {
              setKind(key);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === "sales" && (
        <div className="panel report-filters">
          <label className="field">
            <span>دورهٔ زمانی</span>
            <select
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value);
                if (e.target.value !== "custom")
                  setRange(rangeFor(e.target.value));
                setPage(1);
              }}
            >
              <option value="today">امروز</option>
              <option value="yesterday">دیروز</option>
              <option value="week">۷ روز گذشته</option>
              <option value="month">ماه جاری</option>
              <option value="all">تمام دوره‌ها</option>
              <option value="custom">دورهٔ دلخواه</option>
            </select>
          </label>
          <DateFilter
            {...range}
            onChange={(v) => {
              setRange((r) => ({ ...r, ...v }));
              setPreset("custom");
              setPage(1);
            }}
          />
        </div>
      )}
      <ErrorMessage error={error || printError} />
      {loading && !data && <Loading />}
      {data && (
        <>
          {summary && (
            <div className={`summary-grid ${kind === "sales" ? "five" : ""}`}>
              {(kind === "sales"
                ? [
                    ["مجموع فروشات", money(summary.totalSales)],
                    ["مجموع پرداخت‌ها", money(summary.totalPaid)],
                    ["باقی‌داری", money(summary.outstanding)],
                    ["طول فروخته‌شده", `${number(summary.metersSold)} متر`],
                    [
                      "مساحت فروخته‌شده",
                      `${number(summary.areaSold)} متر مربع`,
                    ],
                  ]
                : [
                    ["رول‌های موجود", number(summary.availableRolls)],
                    [
                      "طول باقی‌مانده",
                      `${number(summary.remainingMeters)} متر`,
                    ],
                    [
                      "مساحت باقی‌مانده",
                      `${number(summary.remainingArea)} متر مربع`,
                    ],
                    ["ارزش خرید موجودی", money(summary.inventoryValue)],
                  ]
              ).map(([label, value], i) => (
                <SummaryCard
                  key={label}
                  label={label}
                  value={value}
                  accent={i === 0}
                />
              ))}
            </div>
          )}
          <p className="small muted">
            {kind === "sales"
              ? "پرداخت و باقی‌داری، وضعیت فعلی فروشات دورهٔ انتخاب‌شده را با رسیدهای بعدی نشان می‌دهد."
              : kind === "inventory"
                ? "ارزش موجودی از حاصل‌ضرب طول باقی‌مانده در قیمت خرید هر متر طولی محاسبه می‌شود. رول‌های بدون قیمت خرید، ارزش صفر دارند."
                : "مشتریان دارای باقی‌داری. مجموع پرداخت‌ها شامل پرداخت هنگام فروش و رسیدهای بعدی است."}
          </p>
          <section className="panel">
            {kind === "sales" ? (
              <SaleTable rows={data.items} />
            ) : kind === "inventory" ? (
              <Table
                rows={data.items}
                columns={[
                  { key: "rollNumber", label: "شمارهٔ رول" },
                  { key: "vinylName", label: "نام وینیل" },
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
                    key: "value",
                    label: "ارزش خرید",
                    render: (r) => money(r.length * (r.costPrice || 0)),
                  },
                ]}
              />
            ) : (
              <Table
                rows={data.items}
                columns={[
                  {
                    key: "name",
                    label: "مشتری",
                    render: (r) => (
                      <Link className="record-link" to={`/customers/${r._id}`}>
                        {r.name}
                      </Link>
                    ),
                  },
                  { key: "phone", label: "شمارهٔ تماس" },
                  {
                    key: "totalPurchases",
                    label: "مجموع خریدها",
                    render: (r) => money(r.totalPurchases),
                  },
                  {
                    key: "totalPaid",
                    label: "مجموع پرداخت‌ها",
                    render: (r) => money(r.totalPaid),
                  },
                  {
                    key: "balance",
                    label: "باقی‌داری",
                    render: (r) => (
                      <strong className="debt">{money(r.balance)}</strong>
                    ),
                  },
                ]}
              />
            )}
            <Pagination data={data} onChange={setPage} />
          </section>
        </>
      )}
      {print && (
        <PrintDocument
          title={`گزارش فروشات · ${range.from || "تمام دوره‌ها"} تا ${range.to || "today"}`}
          sales={print}
          summary={{
            "مجموع فروشات": money(summary.totalSales),
            "مجموع پرداخت‌ها": money(summary.totalPaid),
            باقی‌داری: money(summary.outstanding),
            "طول فروخته‌شده": number(summary.metersSold),
            "متر مربع فروخته‌شده": number(summary.areaSold),
          }}
          onClose={() => setPrint(null)}
        />
      )}
    </>
  );
}
