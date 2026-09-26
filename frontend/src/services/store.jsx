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
const Context = createContext();
export function StoreProvider({ children }) {
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
    const socket = io();
    socket.on("store:changed", refresh);
    socket.on("connect", () => {
      setConnected(true);
      refresh();
    });
    socket.on("disconnect", () => setConnected(false));
    return () => socket.disconnect();
  }, [refresh]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const money = (value, currency = settings?.currency || "USD") =>
    `${Number(value || 0).toLocaleString("fa-AF", { maximumFractionDigits: 2 })} ${currency === "AFN" ? "افغانی" : currency}`;
  return (
    <Context.Provider
      value={{
        version,
        refresh,
        settings,
        notice: setNotice,
        connected,
        money,
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
export function useResource(path) {
  const { version } = useStore();
  const [state, setState] = useState({ data: null, error: "", loading: true });
  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, error: "", loading: true }));
    api(path)
      .then((data) => {
        if (active) setState({ data, error: "", loading: false });
      })
      .catch((e) => {
        if (active) setState({ data: null, error: e.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [path, version]);
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
