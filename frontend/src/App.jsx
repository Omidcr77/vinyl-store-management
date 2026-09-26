import { useState } from "react";
import { NavLink, Routes, Route, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Layers3,
  Plus,
  ReceiptText,
  Users,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Menu,
  X,
} from "lucide-react";
import { StoreProvider, useStore } from "./services/store";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import RollForm from "./pages/RollForm";
import Sales from "./pages/Sales";
import NewSale from "./pages/NewSale";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
const nav = [
  ["/", "داشبورد", LayoutDashboard],
  ["/inventory", "موجودی", Layers3],
  ["/inventory/new", "رول وینیل جدید", Plus],
  ["/sales", "فروشات", ReceiptText],
  ["/sales/new", "فروش جدید", Plus],
  ["/customers", "مشتریان", Users],
  ["/reports", "گزارش‌ها", ChartNoAxesCombined],
];
function Shell() {
  const { settings, connected } = useStore(),
    [menu, setMenu] = useState(false),
    location = useLocation();
  const section =
    {
      inventory: "موجودی",
      sales: "فروشات",
      customers: "مشتریان",
      reports: "گزارش‌ها",
      settings: "تنظیمات",
    }[location.pathname.split("/")[1]] || "نمای عمومی";
  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <Link to="/" className="brand" onClick={() => setMenu(false)}>
          <div className="brand-mark">
            ف<span>/</span>
          </div>
          <div>
            {settings?.storeName || "فرش و قالین فروشی"}
            <small>مدیریت فروش و موجودی</small>
          </div>
        </Link>
        <button
          className="mobile-close"
          aria-label="بستن فهرست"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="nav-label">بخش‌های دکان</div>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end onClick={() => setMenu(false)}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" onClick={() => setMenu(false)}>
            <SettingsIcon size={18} />
            تنظیمات
          </NavLink>
          <div className="store-profile">
            <div className="avatar">ف</div>
            <div>
              مدیریت دکان
              <small>
                <i className={connected ? "dot" : "dot offline"} />
                {connected ? "به‌روزرسانی زنده فعال است" : "در حال اتصال مجدد"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="بازکردن فهرست"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <span>مدیریت دکان</span>
            <span>/</span>
            <strong>{section}</strong>
          </div>
          <div className="topbar-right">
            <span>
              {new Date().toLocaleDateString("fa-AF-u-ca-gregory", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className="currency-label">
              {settings?.currency || "USD"}
            </span>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/new" element={<RollForm />} />
            <Route path="/inventory/:id/edit" element={<RollForm />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/sales/new" element={<NewSale />} />
            <Route path="/sales/:id" element={<Sales detail />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>صفحه یافت نشد</h1>
                  <Link to="/">برگشت به داشبورد</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>
            {settings?.storeName || "فرش و قالین فروشی"} · مدیریت دکان
          </span>
          <span>برای مدیریت روزمرهٔ دکان.</span>
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
