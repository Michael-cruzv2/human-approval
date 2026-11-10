"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";

export default function DrawerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) returnFocusRef.current = activeElement;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") router.back();
    }
    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [router]);

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) router.back();
  }

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const controls = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!controls.length) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={closeOnBackdrop}>
      <div
        ref={panelRef}
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Lead details"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <button className="drawer-close" type="button" onClick={() => router.back()} aria-label="Close lead details">×</button>
        {children}
      </div>
    </div>
  );
}
