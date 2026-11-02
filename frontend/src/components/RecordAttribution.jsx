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
export default function RecordAttribution({ record }) {
  const { date } = useStore();
  return (
    <div className="record-attribution">
      <bdi dir="ltr" className="record-username">
        {record.createdByUsername ? `@${record.createdByUsername}` : "—"}
      </bdi>
      {record.createdAt && (
        <time className="record-date" dateTime={record.createdAt}>
          {date(record.createdAt, { hour: "2-digit", minute: "2-digit" })}
        </time>
      )}
    </div>
  );
}
export const attributionColumn = {
  key: "attribution",
  label: "نام کاربری / تاریخ",
  render: (record) => <RecordAttribution record={record} />,
};
