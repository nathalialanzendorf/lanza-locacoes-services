import type { ReactNode } from "react";

export type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  id?: string;
  className?: string;
  size?: "default" | "compact";
  "aria-label"?: string;
};

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  id,
  className,
  size = "default",
  "aria-label": ariaLabel,
}: ToggleProps) {
  const switchEl = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className={`toggle${checked ? " is-on" : ""}${size === "compact" ? " toggle--compact" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track" aria-hidden>
        <span className="toggle__thumb" />
      </span>
    </button>
  );

  if (label == null) return switchEl;

  return (
    <label className={["toggle-field", className].filter(Boolean).join(" ")}>
      {switchEl}
      <span className="toggle-field__label">{label}</span>
    </label>
  );
}
