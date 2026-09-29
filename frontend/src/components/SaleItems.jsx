import { saleItems } from "../../../shared/sale-items.js";
import { useStore } from "../services/store";
import { Table } from "./UI";
import { number } from "../utils/format";
export default function SaleItems({ sale }) {
  const { money } = useStore();
  return (
    <Table
      rows={saleItems(sale).map((i, index) => ({ ...i, _id: index }))}
      columns={[
        {
          key: "vinylName",
          label: "جنس / رول",
          render: (i) => (
            <>
              <strong>{i.vinylName}</strong>
              <small className="cell-sub">
                رول {number(i.rollNumber)} · {i.type} · {i.color}
              </small>
            </>
          ),
        },
        {
          key: "soldLength",
          label: "ابعاد",
          render: (i) => (
            <>
              <bdi>
                {number(i.soldLength)} × {number(i.width)}
              </bdi>{" "}
              متر<small className="cell-sub">{number(i.area)} متر مربع</small>
            </>
          ),
        },
        {
          key: "unitPrice",
          label: "نرخ واحد",
          render: (i) => (
            <>
              {money(i.pricePerMeter ?? i.pricePerSquareMeter, sale.currency)}
              <small className="cell-sub">
                فی {i.pricingMethod === "area" ? "متر مربع" : "متر طولی"}
              </small>
            </>
          ),
        },
        {
          key: "totalAmount",
          label: "مبلغ",
          render: (i) => money(i.totalAmount, sale.currency),
        },
      ]}
    />
  );
}
