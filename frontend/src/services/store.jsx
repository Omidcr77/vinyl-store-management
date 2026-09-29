import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import { api } from "./api";
import { invoiceFooter } from "../utils/format";
import { formatDate } from "../../../shared/calendar.js";
import { useAuth } from "./auth";
const Context = createContext();
export function StoreProvider({ children }) {
  const { clear, reload } = useAuth();
  const [version, setVersion] = useState(0),
    [settings, setSettings] = useState(null),
    [notice, setNotice] = useState(""),
    [connected, setConnected] = useState(false);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    api("/settings")
      .then((data) =>
        setSettings({
          ...data,
          invoiceFooter: invoiceFooter(data.invoiceFooter),
        }),
      )
      .catch(() => {});
  }, [version]);
  useEffect(() => {
    const socket = io({ withCredentials: true });
    socket.on("auth:revoked", clear);
    socket.on("connect_error", (e) => {
      if (e.message === "UNAUTHORIZED") reload();
    });
    socket.on("store:changed", refresh);
    socket.on("connect", () => {
      setConnected(true);
      refresh();
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      if (reason === "io server disconnect") reload();
    });
    return () => socket.disconnect();
  }, [refresh, clear, reload]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const money = (value, currency = settings?.currency || "USD") =>
    `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency === "AFN" ? "افغانی" : currency}`;
  return (
    <Context.Provider
      value={{
        version,
        refresh,
        settings,
        notice: setNotice,
        connected,
        money,
        date: (value, options) =>
          formatDate(value, settings?.calendar || "gregory", options),
      }}
    >
      {children}
      {notice && (
        <div role="status" className="toast">
          ✓ {notice}
        </div>
      )}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);
export function useResource(path, enabled = true) {
  const { version } = useStore();
  const [state, setState] = useState({ data: null, error: "", loading: true });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let retryTimer;
    const controller = new AbortController();
    setState((s) => ({ ...s, error: "", loading: true }));
    const load = () =>
      api(path, { signal: controller.signal })
        .then((data) => {
          if (active) setState({ data, error: "", loading: false });
        })
        .catch((e) => {
          if (!active) return;
          const reconnecting = [0, 502, 503, 504].includes(e.status);
          setState((s) => ({
            data: reconnecting ? s.data : null,
            error: e.message,
            loading: false,
          }));
          if (reconnecting) retryTimer = setTimeout(load, 2000);
        });
    load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(retryTimer);
    };
  }, [path, version, enabled]);
  return state;
}
export function useDebounce(value, delay = 250) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return result;
}
