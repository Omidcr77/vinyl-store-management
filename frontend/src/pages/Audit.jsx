import { useState } from "react";
import { useResource, useStore } from "../services/store";
import {
  PageHeading,
  Table,
  Pagination,
  ErrorMessage,
  Loading,
} from "../components/UI";
const labels = {
  "auth.login": "ورود",
  "auth.password": "تغییر رمز",
  "user.bootstrap": "ساخت مدیر نخست",
  "user.create": "ساخت کاربر",
  "user.update": "ویرایش کاربر",
  "image.upload": "آپلود عکس",
};
const describe = (action) =>
  labels[action] ||
  action
    .replace("POST /api/sales", "ثبت فروش")
    .replace("POST /api/payments", "ثبت رسید")
    .replace("POST /api/deliveries", "ثبت محموله")
    .replace("POST /api/customers", "افزودن مشتری")
    .replace("PUT /api/customers/", "ویرایش مشتری / ")
    .replace("POST /api/vinyl", "افزودن جنس")
    .replace("PUT /api/vinyl/", "ویرایش جنس / ")
    .replace("DELETE /api/vinyl/", "بایگانی جنس / ")
    .replace("PUT /api/settings", "تغییر تنظیمات");
export default function Audit() {
  const [page, setPage] = useState(1),
    { data, error, loading } = useResource(`/audit?page=${page}`),
    { date } = useStore();
  return (
    <>
      <PageHeading
        title="تاریخچهٔ فعالیت‌ها"
        description="کاربر، عملیات و رکورد مرتبط با هر فعالیت ثبت‌شده."
      />
      <ErrorMessage error={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <section className="panel">
          <Table
            rows={data?.items}
            columns={[
              {
                key: "date",
                label: "تاریخ",
                render: (r) =>
                  date(r.date, { hour: "2-digit", minute: "2-digit" }),
              },
              { key: "actorName", label: "کاربر" },
              {
                key: "action",
                label: "عملیات",
                render: (r) => describe(r.action),
              },
              { key: "target", label: "شناسهٔ رکورد" },
              { key: "details", label: "جزئیات" },
            ]}
          />
          <Pagination data={data} onChange={setPage} />
        </section>
      )}
    </>
  );
}
