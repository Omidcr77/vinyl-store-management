import { useState } from "react";
import { useAuth } from "../services/auth";
import { Table2, LayoutGrid, List } from "lucide-react";

const modes = [
  ["table", "جدول (پیش‌فرض)", Table2],
  ["grid", "شبکه‌ای", LayoutGrid],
  ["rows", "ردیفی", List],
];
export function useRecordView(page) {
  const {user}=useAuth();
  const key = `store:record-view:${user._id}:${page}`;
  const [view, setView] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return modes.some(([value]) => value === stored) ? stored : "table";
    } catch {
      return "table";
    }
  });
  return [
    view,
    (next) => {
      setView(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* View switching still works without storage. */
      }
    },
  ];
}
export default function ViewControls({ value, onChange }) {
  return (
    <div
      className="record-view-controls no-print"
      role="group"
      aria-label="نمایش رکوردها"
    >
      {modes.map(([mode, label, Icon]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
