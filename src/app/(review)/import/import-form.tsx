"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

type PreviewRow = {
  rowNumber: number;
  domain: string;
  companyName: string | null;
  email: string | null;
};

type InvalidRow = {
  rowNumber: number;
  domain: string | null;
  reason: string;
};

type Preview = {
  fileHash: string;
  proof: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  canCommit: boolean;
  validRows: PreviewRow[];
  invalidRows: InvalidRow[];
};

type ImportResult = {
  inserted: number;
  skipped: number;
  invalid: number;
  totalRows: number;
  invalidRows: InvalidRow[];
};

export default function ImportForm({
  maxFileMb,
  maxRows,
}: {
  maxFileMb: number;
  maxRows: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setMessage("");
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose an .xlsx file to continue.");
      return;
    }

    setBusy(true);
    setMessage("");
    setPreview(null);
    setResult(null);
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        message?: string;
        preview?: Preview;
      };
      if (!response.ok || !body.preview) {
        setMessage(body.message ?? "The file could not be previewed.");
        return;
      }
      setPreview(body.preview);
      if (!body.preview.canCommit) {
        setMessage(
          "More than half of the rows are invalid. No rows can be imported from this file.",
        );
      }
    } catch {
      setMessage("The file could not be previewed.");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!file || !preview?.canCommit) return;
    setBusy(true);
    setMessage("");
    const formData = new FormData();
    formData.set("file", file);
    formData.set("sha256", preview.fileHash);
    formData.set("previewProof", preview.proof);
    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        message?: string;
      } & Partial<ImportResult>;
      if (
        !response.ok ||
        typeof body.inserted !== "number" ||
        typeof body.skipped !== "number" ||
        typeof body.invalid !== "number" ||
        typeof body.totalRows !== "number" ||
        !Array.isArray(body.invalidRows)
      ) {
        setMessage(body.message ?? "The import could not be committed.");
        return;
      }
      setResult({
        inserted: body.inserted,
        skipped: body.skipped,
        invalid: body.invalid,
        totalRows: body.totalRows,
        invalidRows: body.invalidRows,
      });
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Import completed.");
    } catch {
      setMessage("The import could not be committed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel page-stack">
      <div className="action-row">
        <a href="/api/import/template">Download template</a>
        <span>
          Only .xlsx · up to {maxFileMb} MB and {maxRows.toLocaleString()} data
          rows
        </span>
      </div>
      <form className="form-grid" onSubmit={submitPreview}>
        <label>
          Excel workbook
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={selectFile}
          />
        </label>
        <button type="submit" disabled={busy || !file}>
          {busy ? "Preparing preview…" : "Preview file"}
        </button>
      </form>

      <p className="form-message" role="status" aria-live="polite">
        {message}
      </p>

      {preview && (
        <section className="page-stack" aria-labelledby="preview-title">
          <div className="page-heading">
            <h2 id="preview-title">Preview</h2>
            <span>
              {preview.totalRows} rows · {preview.validCount} valid ·{" "}
              {preview.invalidCount} invalid
            </span>
          </div>
          <p>
            Review the rows below. Only the email address is treated as the
            contact method.
          </p>
          {preview.validRows.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Domain</th>
                    <th>Company</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.validRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.domain}</td>
                      <td>{row.companyName ?? "—"}</td>
                      <td>{row.email ?? "No email address"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.invalidRows.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Domain</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.invalidRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.domain ?? "—"}</td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            disabled={busy || !preview.canCommit}
            onClick={commitImport}
          >
            {busy ? "Importing…" : `Commit ${preview.validCount} valid rows`}
          </button>
        </section>
      )}

      {result && (
        <section className="notice" aria-live="polite">
          <strong>Import results</strong>
          <p>
            {result.inserted} inserted · {result.skipped} duplicates skipped ·{" "}
            {result.invalid} invalid
          </p>
          {result.invalidRows.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Domain</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.invalidRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.domain ?? "—"}</td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
