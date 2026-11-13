"use client";

import { useEffect, useState } from "react";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string;
  /**
   * When true, the skeleton is shown immediately (used for load-more placeholder rows).
   * When false, the placeholder only appears after 200ms, so fast responses never flash.
   * The 400ms minimum is expressed by the `.sk` fade-in in globals.css.
   */
  immediate?: boolean;
};

export function Skeleton({
  className,
  width,
  height,
  radius = "6px",
  immediate = false,
}: SkeletonProps) {
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) return;
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, [immediate]);

  if (!visible) return null;

  return (
    <i
      className={`sk ${className || ""}`.trim()}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: radius,
      }}
      aria-hidden="true"
    />
  );
}
