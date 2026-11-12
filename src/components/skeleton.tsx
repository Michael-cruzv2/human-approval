"use client";

import { useEffect, useRef, useState } from "react";

type SkeletonProps = {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string;
  /**
   * When true, the skeleton is shown immediately (used for load-more placeholder rows).
   * When false, the skeleton only appears after 200ms and stays at least 400ms.
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [show, setShow] = useState(false);
  const [minTimeReached, setMinTimeReached] = useState(false);

  const shouldShow = immediate || (show && minTimeReached);

  useEffect(() => {
    if (!show && !immediate) {
      timerRef.current = setTimeout(() => setShow(true), 200);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, immediate]);

  useEffect(() => {
    if (show) {
      minTimerRef.current = setTimeout(() => setMinTimeReached(true), 400);
    }
    return () => {
      if (minTimerRef.current) clearTimeout(minTimerRef.current);
    };
  }, [show]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (minTimerRef.current) clearTimeout(minTimerRef.current);
    };
  }, []);

  if (!shouldShow) return null;

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