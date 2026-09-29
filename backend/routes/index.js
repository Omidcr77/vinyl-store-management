import { Router } from "express";
import { allowRoles } from "../middleware/auth.js";
import * as c from "../controllers/storeController.js";
import { exportTable } from "../services/exportService.js";
import { receiveImage, uploadImage } from "../controllers/imageController.js";
import { documentPdf, receiptData } from "../services/documentService.js";
import { statementGet, statementPdf } from "../services/statementService.js";
import {
  priceList,
  priceSave,
  priceDelete,
} from "../controllers/customerPriceController.js";
const router = Router();
const management = allowRoles("admin", "manager");
router.use(["/deliveries", "/reports", "/exports"], management);
router.use("/vinyl", (req, res, next) =>
  ["GET", "HEAD"].includes(req.method) ? next() : management(req, res, next),
);
router.use("/settings", (req, res, next) =>
  ["GET", "HEAD"].includes(req.method)
    ? next()
    : allowRoles("admin")(req, res, next),
);
import {
  deliverySave,
  deliveryImport,
  deliveryTemplate,
  receiveWorkbook,
} from "../controllers/deliveryController.js";
router.post("/deliveries", deliverySave);
router.get("/deliveries/template", deliveryTemplate);
router.post("/deliveries/import", receiveWorkbook, deliveryImport);
router.post("/images", receiveImage, uploadImage);
router.route("/vinyl").get(c.vinylList).post(c.vinylSave);
router
  .route("/vinyl/:id")
  .get(c.vinylGet)
  .put(c.vinylSave)
  .delete(c.vinylDelete);
router.route("/customers").get(c.customerList).post(c.customerSave);
router.route("/customers/:id").get(c.customerGet).put(c.customerSave);
router.get("/customers/:id/statement", statementGet);
router.get("/customers/:id/statement/pdf", statementPdf);
router.route("/customers/:id/prices").get(priceList).put(priceSave);
router.delete("/customers/:id/prices/:priceId", priceDelete);
router.route("/sales").get(c.saleList).post(c.saleCreate);
router.get("/sales/:id", c.saleGet);
router.get("/sales/:id/pdf", documentPdf);
router.get("/payments/:id/pdf", documentPdf);
router.get("/payments/:id", async (req, res) =>
  res.json({ success: true, data: await receiptData(req.params.id) }),
);
router.route("/payments").get(c.paymentList).post(c.paymentCreate);
router.get("/dashboard/summary", c.dashboardGet);
router.get("/reports/:kind", c.reportGet);
router.get("/exports/:kind", exportTable);
router.route("/settings").get(c.settingsGet).put(c.settingsSave);
export default router;
