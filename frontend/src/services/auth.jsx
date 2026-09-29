import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { api, setCsrfToken } from "./api";
const Context = createContext();
export const roleLabels = {
  admin: "مدیر سیستم",
  manager: "مدیر",
  staff: "کارمند",
};
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const clear = useCallback(() => {
    setUser(null);
    setCsrfToken("");
  }, []);
  const accept = (data) => {
    setCsrfToken(data.csrf);
    setUser(data.user);
  };
  const load = useCallback(async () => {
    try {
      accept(await api("/auth/session"));
      setError("");
    } catch (e) {
      if (e.status === 401) {
        clear();
        setError("");
      } else setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clear]);
  useEffect(() => {
    load();
    window.addEventListener("auth:unauthorized", clear);
    const focus = () => load();
    window.addEventListener("focus", focus);
    const timer = setInterval(load, 60000);
    return () => {
      window.removeEventListener("auth:unauthorized", clear);
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  }, [load, clear]);
  async function login(username, password) {
    accept(
      await api("/auth/login", {
        method: "POST",
        body: { username, password },
      }),
    );
    setError("");
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    clear();
  }
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        clear,
        reload: load,
        canManage: user?.role === "admin" || user?.role === "manager",
        isAdmin: user?.role === "admin",
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
