import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Plus, Printer, SlidersHorizontal } from "lucide-react";
import { query } from "../services/api";
import { useResource, useDebounce, useStore } from "../services/store";
import {
  PageHeading,
  Pagination,
  SearchInput,
  Field,
  Badge,
  Loading,
  ErrorMessage,
  ExportButtons,
  DateFilter,
  BackLink,
} from "../components/UI";
import SaleTable from "../components/SaleTable";
import ViewControls, { useRecordView } from "../components/ViewControls";
import PrintDocument from "../components/PrintDocument";
import Lookup from "../components/Lookup";
import NewSale from "./NewSale";
import { number, customerName } from "../utils/format";
export default function Sales({ detail, create = false }) {
  return detail ? <Invoice /> : <SalesList create={create} />;
}
function SalesList({ create }) {
  const [recordView, setRecordView] = useRecordView("sales");
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({}),
    [page, setPage] = useState(1),
    [expanded, setExpanded] = useState(false),
    [customer, setCustomer] = useState(null);
  const debounced = useDebounce(search),
    params = { ...filters, search: debounced, page },
    { data, loading, error } = useResource(`/sales?${query(params)}`);
  function change(next) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }
  return (
    <>
      <PageHeading
        eyebrow="معاملات"
        title="تاریخچهٔ فروشات"
        description="تمام فروشات و معاملات مشتریان در یک‌جا محفوظ است."
      >
        <ExportButtons kind="sales" params={params} />
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus size={17} /> فروش جدید
        </button>
      </PageHeading>
      {(adding || create) && (
        <NewSale
          onClose={() => {
            setAdding(false);
            if (create) navigate("/sales");
          }}
        />
      )}
      <section className="panel">
        <div className="toolbar">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="جستجوی بل، مشتری، وینیل یا رول…"
          />
          <div className="actions">
            <select
              aria-label="نوع پرداخت"
              value={filters.paymentType || ""}
              onChange={(e) => change({ paymentType: e.target.value })}
            >
              <option value="">همهٔ انواع پرداخت</option>
              <option value="cash">پرداخت کامل</option>
              <option value="partial">قسمی</option>
              <option value="credit">قرض</option>
            </select>
            <button onClick={() => setExpanded((v) => !v)}>
              <SlidersHorizontal size={16} /> فیلترها
            </button>
          </div>
        </div>
        {expanded && (
          <div className="filter-grid">
            <DateFilter {...filters} onChange={change} />
            <Field
              label="نام وینیل"
              value={filters.vinylName || ""}
              onChange={(e) => change({ vinylName: e.target.value })}
            />
            <Field
              label="شمارهٔ رول"
              type="number"
              min="1"
              value={filters.rollNumber || ""}
              onChange={(e) => change({ rollNumber: e.target.value })}
            />
            <Field label="مرتب‌سازی">
              <select
                value={filters.sort || "soldDate"}
                onChange={(e) => change({ sort: e.target.value })}
              >
                <option value="soldDate">تاریخ</option>
                <option value="billNumber">شمارهٔ بل</option>
                <option value="totalAmount">مبلغ</option>
              </select>
            </Field>
            <Field label="ترتیب">
              <select
                value={filters.order || "desc"}
                onChange={(e) => change({ order: e.target.value })}
              >
                <option value="desc">نزولی</option>
                <option value="asc">صعودی</option>
              </select>
            </Field>
            <div className="full">
              <span className="field-label">فیلتر مشتری</span>
              <Lookup
                kind="customers"
                selected={customer}
                onSelect={(c) => {
                  setCustomer(c);
                  change({ customerId: c?._id || "" });
                }}
              />
            </div>
            <button
              onClick={() => {
                setSearch("");
                setFilters({});
                setCustomer(null);
                setPage(1);
              }}
            >
              پاک‌کردن فیلترها
            </button>
          </div>
        )}
        <ErrorMessage error={error} />
        <div className="record-view-bar">
          <ViewControls value={recordView} onChange={setRecordView} />
        </div>
        {loading && !data ? (
          <Loading />
        ) : (
          <SaleTable rows={data?.items} view={recordView} />
        )}
        <Pagination data={data} onChange={setPage} />
      </section>
    </>
  );
}
function Invoice() {
  const { id } = useParams(),
    { data: sale, loading, error } = useResource(`/sales/${id}`),
    { date, money, settings } = useStore(),
    [print, setPrint] = useState(false);
  return (
    <>
      <BackLink to="/sales">برگشت به فروشات</BackLink>
      <PageHeading
        eyebrow="بل فروش"
        title={sale?.billNumber || "بل فروش"}
        description="سند محفوظ این فروش."
      >
        {sale && (
          <button onClick={() => setPrint(true)}>
            <Printer size={17} /> چاپ بل
          </button>
        )}
      </PageHeading>
      <ErrorMessage error={error} />
      {loading && !sale && <Loading />}
      {sale && (
        <section className="panel invoice">
          <div className="invoice-top">
            <div>
              <h2>{settings?.storeName}</h2>
              <p>{settings?.storeAddress}</p>
              <p>{settings?.phone}</p>
            </div>
            <div>
              <Badge value={sale.paymentType} />
              <p>{date(sale.soldDate)}</p>
              <strong>{sale.billNumber}</strong>
            </div>
          </div>
          <div className="invoice-customer">
            <span className="eyebrow">مشتری</span>
            <h3>{customerName(sale.customerName)}</h3>
            <p>
              {sale.customerPhone} {sale.customerAddress}
            </p>
            {sale.customerId && (
              <Link className="text-link" to={`/customers/${sale.customerId}`}>
                مشاهدهٔ حساب مشتری ←
              </Link>
            )}
          </div>
          <SaleTable rows={[sale]} />
          <dl className="detail-grid">
            <div>
              <dt>نوع / رنگ</dt>
              <dd>
                {sale.type} / {sale.color}
              </dd>
            </div>
            <div>
              <dt>ابعاد</dt>
              <dd>
                {number(sale.soldLength)} متر × {number(sale.width)} متر ={" "}
                {number(sale.area)} متر مربع
              </dd>
            </div>
            <div>
              <dt>نرخ واحد</dt>
              <dd>
                {money(
                  sale.pricePerMeter ?? sale.pricePerSquareMeter,
                  sale.currency,
                )}{" "}
                / {sale.pricingMethod === "area" ? "متر مربع" : "متر"}
              </dd>
            </div>
            <div>
              <dt>یادداشت‌ها</dt>
              <dd>{sale.notes || "—"}</dd>
            </div>
          </dl>
          <div className="invoice-totals">
            <p>
              <span>مبلغ مجموعی</span>
              <strong>{money(sale.totalAmount, sale.currency)}</strong>
            </p>
            <p>
              <span>پرداخت هنگام فروش</span>
              <strong>{money(sale.paidAmount, sale.currency)}</strong>
            </p>
            {sale.creditApplied > 0 && (
              <p>
                <span>استفاده از طلب مشتری</span>
                <strong>{money(sale.creditApplied, sale.currency)}</strong>
              </p>
            )}
            <p>
              <span>پرداخت‌های بعدی</span>
              <strong>
                {money(
                  sale.totalAmount -
                    sale.paidAmount -
                    (sale.creditApplied || 0) -
                    sale.remainingBalance,
                  sale.currency,
                )}
              </strong>
            </p>
            <p>
              <span>باقی‌داری فعلی</span>
              <strong>{money(sale.remainingBalance, sale.currency)}</strong>
            </p>
          </div>
          <p className="invoice-footer">{settings?.invoiceFooter}</p>
        </section>
      )}
      {print && (
        <PrintDocument
          pdfPath={`/sales/${sale._id}`}
          filename={sale.billNumber}
          title={`بل فروش ${sale.billNumber}`}
          customer={{
            name: sale.customerName,
            phone: sale.customerPhone,
            address: sale.customerAddress,
          }}
          sales={[sale]}
          summary={{
            مجموع: money(sale.totalAmount, sale.currency),
            "پرداخت هنگام فروش": money(sale.paidAmount, sale.currency),
            "باقی‌داری فعلی": money(sale.remainingBalance, sale.currency),
          }}
          onClose={() => setPrint(false)}
        />
      )}
    </>
  );
}
