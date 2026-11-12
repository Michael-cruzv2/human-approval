"use client";

type SpinnerProps = {
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

export function Spinner({ size = "md", className, "aria-label": ariaLabel }: SpinnerProps) {
  return (
    <b
      className={`spin ${size === "sm" ? "spin-sm" : ""} ${className || ""}`}
      aria-label={ariaLabel ?? "Loading"}
      aria-hidden="true"
    />
  );
}