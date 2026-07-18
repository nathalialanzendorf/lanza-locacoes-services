import { useEffect, useState } from "react";
import { brToIsoDate, dateValueToDisplay, maskDateBrInput } from "@/lib/dateBr";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Formato exposto ao formulário — a API Lanza usa DD/MM/AAAA (`br`). */
  format?: "br" | "iso";
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
};

function emitStoredValue(masked: string, format: "br" | "iso", onChange: (value: string) => void) {
  if (format === "iso") {
    const iso = brToIsoDate(masked);
    if (iso) onChange(iso);
    return;
  }
  onChange(masked);
}

export function DateInput({
  value,
  onChange,
  format = "br",
  disabled,
  required,
  className,
  id,
}: DateInputProps) {
  const displayFromProps = dateValueToDisplay(value, format);
  const [text, setText] = useState(displayFromProps);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setText(displayFromProps);
  }, [displayFromProps, focused]);

  function handleChange(raw: string) {
    const masked = maskDateBrInput(raw);
    setText(masked);
    if (format === "br") {
      onChange(masked);
      return;
    }
    if (brToIsoDate(masked)) emitStoredValue(masked, format, onChange);
  }

  function handleBlur() {
    setFocused(false);
    const masked = maskDateBrInput(text);
    if (!masked.trim()) {
      onChange("");
      setText("");
      return;
    }
    const iso = brToIsoDate(masked);
    if (iso) {
      emitStoredValue(masked, format, onChange);
      setText(dateValueToDisplay(format === "iso" ? iso : masked, "br"));
      return;
    }
    setText(displayFromProps);
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={["input", "input--date-br", className].filter(Boolean).join(" ")}
      value={text}
      placeholder="dd/mm/aaaa"
      maxLength={10}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onChange={(e) => handleChange(e.target.value)}
      disabled={disabled}
      required={required}
    />
  );
}
