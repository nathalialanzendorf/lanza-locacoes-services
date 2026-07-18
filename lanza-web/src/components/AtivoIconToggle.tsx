import { IconDesabilitar, IconHabilitar } from "@/components/icons";
import { LABEL } from "@/lib/labels";

type Props = {
  ativo: boolean;
  onChange: (ativo: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
};

export function AtivoIconToggle({ ativo, onChange, disabled, label, hint }: Props) {
  return (
    <div className="ativo-icon-toggle">
      {label ? <span className="field__label">{label}</span> : null}
      <div className="ativo-icon-toggle__buttons" role="group" aria-label={label ?? "Status ativo"}>
        <button
          type="button"
          className={`btn btn--icon btn--icon-ok${ativo ? " is-active" : ""}`}
          disabled={disabled || ativo}
          onClick={() => onChange(true)}
          aria-label={LABEL.habilitar}
          title={LABEL.habilitar}
          aria-pressed={ativo}
        >
          <IconHabilitar className="row-actions__icon" />
        </button>
        <button
          type="button"
          className={`btn btn--icon btn--icon-warn${!ativo ? " is-active" : ""}`}
          disabled={disabled || !ativo}
          onClick={() => onChange(false)}
          aria-label={LABEL.desabilitar}
          title={LABEL.desabilitar}
          aria-pressed={!ativo}
        >
          <IconDesabilitar className="row-actions__icon" />
        </button>
      </div>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}
