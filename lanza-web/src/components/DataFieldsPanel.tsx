type FieldRow = {
  label: string;
  value: unknown;
};

type Props = {
  title?: string;
  rows: FieldRow[];
};

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function DataFieldsPanel({ title = "Resultado", rows }: Props) {
  const visiveis = rows.filter((r) => r.value != null && r.value !== "");
  if (visiveis.length === 0) return null;

  return (
    <section className="result-panel">
      <h2 className="result-panel__title">{title}</h2>
      <dl className="data-fields">
        {visiveis.map((row) => (
          <div key={row.label} className="data-fields__row">
            <dt>{row.label}</dt>
            <dd>{formatValue(row.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
