import { roleLabels } from "../../../shared/actors.js";
import { useStore } from "../services/store";
export function ActorIdentity({ name, username, role }) {
  if (!name && !username)
    return <span className="muted">رکورد قبلی — کاربر ثبت نشده</span>;
  return (
    <span className="actor-identity">
      <strong>{name || username}</strong>
      <small className="cell-sub">
        {roleLabels[role] || "نقش هنگام ثبت محفوظ نیست"}
        {username && (
          <>
            {" "}
            · <bdi dir="ltr">@{username}</bdi>
          </>
        )}
      </small>
    </span>
  );
}
export default function RecordAttribution({ record, showUpdated = true }) {
  const { date } = useStore();
  const edited =
    showUpdated &&
    record.updatedBy &&
    (String(record.updatedBy) !== String(record.createdBy) ||
      record.updatedByName !== record.createdByName ||
      new Date(record.updatedAt) > new Date(record.createdAt));
  const line = (prefix, time, label) => (
    <div className="attribution-event">
      <small className="attribution-label">{label}</small>
      <ActorIdentity
        name={record[prefix + "Name"]}
        username={record[prefix + "Username"]}
        role={record[prefix + "Role"]}
      />
      {time && (
        <time className="cell-sub" dateTime={time}>
          {date(time, { hour: "2-digit", minute: "2-digit" })}
        </time>
      )}
    </div>
  );
  return (
    <div className="record-attribution">
      {line("createdBy", record.createdAt, "ثبت‌کننده")}
      {edited && line("updatedBy", record.updatedAt, "آخرین تغییر")}
    </div>
  );
}
export const attributionColumn = {
  key: "attribution",
  label: "ثبت‌کننده / آخرین تغییر",
  render: (record) => <RecordAttribution record={record} />,
};
