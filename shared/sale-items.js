// Older invoices stored one item directly on the sale document.
export const saleItems = (sale) =>
  sale?.items?.length ? sale.items : sale ? [sale] : [];
