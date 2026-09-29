import Suppliers, { SupplierDetail } from "./pages/Suppliers";
import { useState } from "react";
import {
  NavLink,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  Layers3,
  ReceiptText,
  Users,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Menu,
  LogOut,
  X,
} from "lucide-react";
import { StoreProvider, useStore } from "./services/store";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import RollForm from "./pages/RollForm";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { AuthProvider, useAuth, roleLabels } from "./services/auth";
import Login from "./pages/Login";
import Account from "./pages/Account";
import UserManagement from "./pages/Users";
import Audit from "./pages/Audit";
const nav = [
  ["/", "داشبورد", LayoutDashboard],
  ["/inventory", "موجودی", Layers3],
  ["/sales", "فروشات", ReceiptText],
  ["/customers", "مشتریان", Users],
  ["/suppliers", "تهیه‌کنندگان", Users],
  ["/reports", "گزارش‌ها", ChartNoAxesCombined],
];
function Shell() {
  const { user, canManage, isAdmin, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const { settings, connected, date } = useStore(),
    [menu, setMenu] = useState(false),
    location = useLocation();
  const section =
    {
      inventory: "موجودی",
      sales: "فروشات",
      customers: "مشتریان",
      reports: "گزارش‌ها",
      suppliers: "تهیه‌کنندگان",
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
          {nav
            .filter(
              ([path]) =>
                !["/reports", "/suppliers"].includes(path) || canManage,
            )
            .map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end onClick={() => setMenu(false)}>
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {isAdmin && (
            <>
              <NavLink to="/users" onClick={() => setMenu(false)}>
                <Users size={18} />
                مدیریت کاربران
              </NavLink>
              <NavLink to="/audit" onClick={() => setMenu(false)}>
                <ChartNoAxesCombined size={18} />
                تاریخچهٔ فعالیت‌ها
              </NavLink>
            </>
          )}
          {isAdmin && (
            <NavLink to="/settings" onClick={() => setMenu(false)}>
              <SettingsIcon size={18} />
              تنظیمات
            </NavLink>
          )}
          <div className="store-profile">
            <div className="avatar">ف</div>
            <div>
              {user.name} · {roleLabels[user.role]}
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
            <Link to="/account" className="account-link">
              حساب من
            </Link>
            <button
              className="logout-button no-print"
              type="button"
              onClick={() => logout().catch((e) => setLogoutError(e.message))}
            >
              <LogOut size={18} aria-hidden="true" />
              خروج
            </button>
            <span>{date(new Date(), { weekday: "short" })}</span>
            <span className="currency-label">
              {settings?.currency || "USD"}
            </span>
          </div>
        </header>
        <main>
          {logoutError && (
            <p role="alert" className="error">
              {logoutError}
            </p>
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route
              path="/inventory/new"
              element={<Navigate to="/inventory?new=1" replace />}
            />
            <Route
              path="/inventory/:id/edit"
              element={
                <Access>
                  <RollForm />
                </Access>
              }
            />
            <Route path="/sales" element={<Sales />} />
            <Route path="/sales/new" element={<Sales create />} />
            <Route path="/sales/:id" element={<Sales detail />} />
            <Route
              path="/suppliers"
              element={
                <Access>
                  <Suppliers />
                </Access>
              }
            />
            <Route
              path="/suppliers/:id"
              element={
                <Access>
                  <SupplierDetail />
                </Access>
              }
            />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route
              path="/reports"
              element={
                <Access>
                  <Reports />
                </Access>
              }
            />
            <Route
              path="/settings"
              element={
                <Access admin>
                  <Settings />
                </Access>
              }
            />
            <Route
              path="/users"
              element={
                <Access admin>
                  <UserManagement />
                </Access>
              }
            />
            <Route
              path="/audit"
              element={
                <Access admin>
                  <Audit />
                </Access>
              }
            />
            <Route path="/account" element={<Account />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
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
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
function Access({ admin = false, children }) {
  const { canManage, isAdmin } = useAuth();
  return (admin ? isAdmin : canManage) ? children : <Navigate to="/" replace />;
}
function AuthenticatedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page">در حال بررسی حساب…</div>;
  if (!user) return <Login />;
  return (
    <StoreProvider key={user._id}>
      <Shell />
    </StoreProvider>
  );
}
