"use client";

import { useState } from "react";

export default function StructuredData({
  value,
}: {
  value: Record<string, unknown>;
}) {
  const [message, setMessage] = useState("");
  const raw = JSON.stringify(value, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setMessage("Copied.");
    } catch {
      setMessage("Could not copy. Select the raw JSON instead.");
    }
  }

  return (
    <div className="structured-data">
      <dl className="facts-grid">
        {Object.entries(value).map(([key, item]) => (
          <div className="fact" key={key}>
            <dt>{key}</dt>
            <dd>
              {typeof item === "string"
                ? item
                : (JSON.stringify(item, null, 2) ?? "—")}
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Raw JSON</summary>
        <div className="action-row">
          <button type="button" onClick={copy}>
            Copy JSON
          </button>
          <span role="status">{message}</span>
        </div>
        <pre>{raw}</pre>
      </details>
    </div>
  );
}
