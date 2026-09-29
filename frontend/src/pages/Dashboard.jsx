import { useAuth } from "../services/auth";
import { Link } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Layers3,
  Ruler,
  Grid2X2,
  Wallet,
  Users,
  ReceiptText,
  CircleDollarSign,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useResource, useStore } from "../services/store";
import {
  PageHeading,
  SummaryCard,
  Table,
  Loading,
  ErrorMessage,
} from "../components/UI";
import { number } from "../utils/format";
export default function Dashboard() {
  const { canManage } = useAuth();
  const { data, loading, error } = useResource("/dashboard/summary"),
    { date, money, settings } = useStore();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      label: d.toLocaleDateString("fa-AF", { weekday: "short" }),
      amount: data?.trend?.find((t) => t._id === key)?.total || 0,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.amount));
  if (!canManage)
    return (
      <>
        <PageHeading title="داشبورد" description="فروش، رسید و حساب مشتریان">
          <Link className="button primary" to="/sales/new">
            فروش جدید
          </Link>
        </PageHeading>
        <ErrorMessage error={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          data && (
            <div className="summary-grid">
              <SummaryCard
                label="رول‌های موجود"
                value={number(data.availableRolls)}
              />
              <SummaryCard label="مشتریان" value={number(data.customers)} />
            </div>
          )
        )}
        <div className="actions">
          <Link className="button" to="/inventory">
            موجودی
          </Link>
          <Link className="button" to="/customers">
            مشتریان و رسیدها
          </Link>
          <Link className="button" to="/sales">
            فروشات
          </Link>
        </div>
      </>
    );
  return (
    <>
      <PageHeading
        title="نمای عمومی دکان"
        description="نمای روشن از موجودی، فروشات و مشتریان دکان شما."
      >
        <Link className="button" to="/inventory/new">
          <Plus size={17} /> افزودن رکورد
        </Link>
        <Link className="button primary" to="/sales/new">
          <Plus size={17} /> فروش جدید
        </Link>
      </PageHeading>
      <ErrorMessage error={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="overview-banner">
            <div>
              <span className="eyebrow">هر متر ارزش دارد</span>
              <h2>موجودی دقیق، فروش مطمئن.</h2>
              <p>موجودی و حساب‌ها را بررسی کنید و فروش امروز را آغاز نمایید.</p>
            </div>
            <Link to="/inventory">
              مشاهدهٔ موجودی <ArrowUpRight size={18} />
            </Link>
            <div className="floor-pattern" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="summary-grid">
            <SummaryCard
              label="مجموع فروشات"
              value={money(data.totalRevenue)}
              detail="تمام فروشات ثبت‌شده"
              icon={CircleDollarSign}
              accent
            />
            <SummaryCard
              label="فروشات امروز"
              value={money(data.todaySales)}
              detail="فروشات ثبت‌شدهٔ امروز"
              icon={ReceiptText}
            />
            <SummaryCard
              label="فروشات ماه جاری"
              value={money(data.monthSales)}
              detail="ماه جاری میلادی"
              icon={CalendarDays}
            />
            <SummaryCard
              label="مجموع باقی‌داری مشتریان"
              value={money(data.outstandingDebt)}
              detail={`طلب مشتریان: ${money(data.customerCredit || 0)}`}
              icon={Wallet}
            />
            <SummaryCard
              label="رول‌های موجود"
              value={number(data.availableRolls)}
              detail="رول‌های دارای موجودی"
              icon={Layers3}
            />
            <SummaryCard
              label="طول باقی‌مانده"
              value={`${number(data.remainingMeters)} متر`}
              detail="آمادهٔ برش و فروش"
              icon={Ruler}
            />
            <SummaryCard
              label="مساحت موجودی"
              value={`${number(data.remainingArea)} متر مربع`}
              detail="مساحت مجموعی فرش باقی‌مانده"
              icon={Grid2X2}
            />
            <SummaryCard
              label="مشتریان"
              value={number(data.customers)}
              detail="فهرست مشتریان شما"
              icon={Users}
            />
          </div>
          <div className="dashboard-middle">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>روند فروشات</h2>
                  <p>فروش روزانه در 7 روز گذشته</p>
                </div>
                <span className="subtle-tag">7 روز گذشته</span>
              </div>
              <div className="chart" aria-label="نمودار فروش روزانه">
                {days.map((d, i) => (
                  <div className="chart-column" key={i}>
                    <span>{money(d.amount)}</span>
                    <div className="bar-track">
                      <div
                        className={i === 6 ? "bar current" : "bar"}
                        style={{
                          height: `${Math.max(d.amount ? 3 : 0, (d.amount / max) * 100)}%`,
                        }}
                        title={`${d.label}: ${money(d.amount)}`}
                      />
                    </div>
                    <small>{d.label}</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>رول‌های کم‌موجود</h2>
                  <p>کمتر از {settings?.lowStockThreshold ?? 5} متر</p>
                </div>
                <span className="amber-dot" />
              </div>
              <div className="low-stock-list">
                {data.lowStock.length ? (
                  data.lowStock.map((r) => (
                    <Link to={`/inventory?search=${r.rollNumber}`} key={r._id}>
                      <div
                        className="swatch"
                        data-type={r.type.toLowerCase()}
                      />
                      <div>
                        <strong>{r.vinylName}</strong>
                        <small>
                          شمارهٔ رول{r.rollNumber} · {r.color}
                        </small>
                      </div>
                      <span>{number(r.length)} متر</span>
                    </Link>
                  ))
                ) : (
                  <div className="empty">
                    موجودی کافی است؛ هیچ رولی کم‌موجود نیست.
                  </div>
                )}
              </div>
              <Link className="panel-link" to="/inventory?status=low-stock">
                بررسی موجودی <ArrowRight size={15} />
              </Link>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>فروشات اخیر</h2>
                <p>آخرین معاملات دکان شما</p>
              </div>
              <Link className="text-link" to="/sales">
                تمام فروشات <ArrowRight size={15} />
              </Link>
            </div>
            <Table
              rows={data.recentSales}
              columns={[
                {
                  key: "billNumber",
                  label: "شمارهٔ بل",
                  render: (r) => (
                    <Link className="record-link" to={`/sales/${r._id}`}>
                      {r.billNumber}
                    </Link>
                  ),
                },
                { key: "customerName", label: "مشتری" },
                { key: "vinylName", label: "وینیل" },
                {
                  key: "soldLength",
                  label: "طول",
                  render: (r) => `${number(r.soldLength)} متر`,
                },
                {
                  key: "totalAmount",
                  label: "مبلغ",
                  render: (r) => (
                    <strong>{money(r.totalAmount, r.currency)}</strong>
                  ),
                },
                {
                  key: "soldDate",
                  label: "تاریخ",
                  render: (r) => date(r.soldDate),
                },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
