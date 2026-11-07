import { getAppConfig } from "@/lib/server/config";
import ImportForm from "./import-form";

export default function ImportPage() {
  const limits = getAppConfig().app.import;
  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Lead intake</p>
          <h1>Import leads</h1>
        </div>
      </header>
      <p className="notice">
        Imported leads always enter review as PENDING and NEEDS_REVIEW. Email is
        the primary contact method; phone numbers do not replace an email
        address.
      </p>
      <ImportForm maxFileMb={limits.max_file_mb} maxRows={limits.max_rows} />
    </section>
  );
}
