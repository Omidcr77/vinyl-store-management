export const number = (value) =>
  Number(value || 0).toLocaleString("fa-AF", { maximumFractionDigits: 3 });
export const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("fa-AF-u-ca-gregory", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
export const paymentMethod = (value) =>
  ({ cash: "نقد", bank: "بانک", other: "سایر" })[value] || value;
export const customerName = (value) =>
  value === "Walk-in customer" ? "مشتری گذری" : value;
export const invoiceFooter = (value) =>
  value === "Thank you for choosing us." ? "از خرید شما سپاسگزاریم." : value;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function formValues(form, numeric = []) {
  const values = Object.fromEntries(new FormData(form));
  for (const key of numeric) {
    if (values[key] === "") delete values[key];
    else if (values[key] !== undefined) values[key] = Number(values[key]);
  }
  return values;
}
