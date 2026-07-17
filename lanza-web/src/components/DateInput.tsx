import { brToIsoDate, isoDateToBr } from "@/lib/dateBr";

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

export function DateInput({
  value,
  onChange,
  format = "br",
  disabled,
  required,
  className,
  id,
}: DateInputProps) {
  const isoValue = format === "iso" ? brToIsoDate(value) || value.trim() : brToIsoDate(value);

  function handleChange(iso: string) {
    onChange(format === "iso" ? iso : isoDateToBr(iso));
  }

  return (
    <input
      id={id}
      type="date"
      className={["input", "input--date", className].filter(Boolean).join(" ")}
      value={isoValue}
      onChange={(e) => handleChange(e.target.value)}
      disabled={disabled}
      required={required}
    />
  );
}
