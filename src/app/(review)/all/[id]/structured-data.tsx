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

  function renderItem(item: unknown): React.ReactNode {
    if (item === null || item === undefined) return <span className="muted">—</span>;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean")
      return String(item);
    if (Array.isArray(item)) {
      if (item.length === 0) return <span className="muted">—</span>;
      return (
        <ul className="facts-list">
          {item.map((sub, index) => (
            <li key={String(index)}>{renderItem(sub)}</li>
          ))}
        </ul>
      );
    }
    if (typeof item === "object") {
      const entries = Object.entries(item);
      if (entries.length === 0) return <span className="muted">—</span>;
      return (
        <dl className="facts-grid facts-grid--nested">
          {entries.map(([key, sub]) => (
            <div className="fact" key={key}>
              <dt className="muted">{key}</dt>
              <dd>{renderItem(sub)}</dd>
            </div>
          ))}
        </dl>
      );
    }
    return <span className="muted">—</span>;
  }

  return (
    <div className="structured-data">
      <dl className="facts-grid">
        {Object.entries(value).map(([key, item]) => (
          <div className="fact" key={key}>
            <dt>{key}</dt>
            <dd>{renderItem(item)}</dd>
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
