"use client";

import type { ReactNode } from "react";

export default function FilterForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action="/all"
      method="get"
      className={className}
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      {children}
      <button type="submit" className="visually-hidden">Apply filters</button>
    </form>
  );
}
