import { useEffect, useRef, useState } from "react";
import { useStore } from "../services/store";
import {
  dateText,
  parseDate,
  dateParts,
  formatDate,
  monthStart,
} from "../../../shared/calendar.js";

export default function DateInput({
  value,
  defaultValue,
  onChange,
  name,
  type,
  ...props
}) {
  const { settings } = useStore();
  const calendar = settings?.calendar || "gregory";
  const inputRef = useRef();
  const [text, setText] = useState(() =>
    dateText(value || defaultValue, calendar),
  );
  const [open, setOpen] = useState(false);
  useEffect(() => inputRef.current?.setCustomValidity(""), [text]);
  const [view, setView] = useState(() =>
    monthStart(value || defaultValue || new Date(), "persian"),
  );
  useEffect(() => {
    setText(dateText(value ?? defaultValue, calendar));
  }, [value, defaultValue, calendar]);
  if (calendar !== "persian")
    return (
      <input
        {...props}
        type="date"
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
      />
    );
  const iso = parseDate(text, calendar);
  const p = dateParts(view, calendar);
  const days = Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    iso: parseDate(`${p.year}/${p.month}/${i + 1}`, calendar),
  })).filter((d) => d.iso);
  const offset = (new Date(view).getUTCDay() + 1) % 7;
  function choose(next) {
    setText(dateText(next, calendar));
    onChange?.({ target: { value: next, name } });
    setOpen(false);
  }
  function move(n) {
    const month = p.month + n;
    setView(
      parseDate(
        `${p.year + (month === 13 ? 1 : month === 0 ? -1 : 0)}/${month === 13 ? 1 : month === 0 ? 12 : month}/1`,
        calendar,
      ),
    );
  }
  return (
    <div className="calendar-input">
      <div className="calendar-entry">
        <input
          {...props}
          type="text"
          ref={inputRef}
          dir="ltr"
          inputMode="numeric"
          placeholder="1405/07/06"
          value={text}
          pattern={
            text && !iso ? "(?!)" : "[0-9]{4}(/|-)[0-9]{1,2}(/|-)[0-9]{1,2}"
          }
          title="تاریخ هجری شمسی، مانند 1405/07/06"
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const parsed = parseDate(next, calendar);
            if (parsed || !next)
              onChange?.({ target: { value: parsed, name } });
          }}
        />
        <input type="hidden" name={name} value={iso} />
        <button
          type="button"
          aria-label="انتخاب تاریخ شمسی"
          aria-expanded={open}
          onClick={() => {
            setView(monthStart(iso || new Date(), calendar));
            setOpen(!open);
          }}
        >
          ▦
        </button>
      </div>
      <small>هجری شمسی · سال/ماه/روز</small>
      {open && (
        <div
          className="calendar-picker"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="calendar-nav">
            <button type="button" aria-label="ماه قبل" onClick={() => move(-1)}>
              ‹
            </button>
            <strong>{formatDate(view, calendar, { day: undefined })}</strong>
            <button type="button" aria-label="ماه بعد" onClick={() => move(1)}>
              ›
            </button>
          </div>
          <div className="calendar-grid">
            {["ش", "ی", "د", "س", "چ", "پ", "ج"].map((d, i) => (
              <small key={`w${i}`}>{d}</small>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {days.map((d) => (
              <button
                type="button"
                key={d.day}
                aria-label={dateText(d.iso, calendar)}
                className={d.iso === iso ? "primary" : ""}
                onClick={() => choose(d.iso)}
              >
                {d.day}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              choose(dateText(new Date(), "gregory").replaceAll("/", "-"))
            }
          >
            امروز
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            بستن
          </button>
        </div>
      )}
    </div>
  );
}
