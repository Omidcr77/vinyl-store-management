import { useState } from "react";
import { ErrorMessage } from "./UI";
export default function DocumentActions({ path, filename, print = true }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api${path}/pdf`);
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error?.message ||
            "دریافت PDF انجام نشد.",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="document-actions no-print">
      {print && (
        <button onClick={() => window.print()}>چاپ / ذخیرهٔ PDF</button>
      )}
      <button className="primary" disabled={busy} onClick={download}>
        {busy ? "در حال تهیهٔ PDF…" : "دانلود PDF"}
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}
