import { Toggle } from "@/components/Toggle";
import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";

export function RastreameEspelhoToggle() {
  const { ativo, config, loading, setAtivo } = useRastreameEspelho();

  if (!config) return null;

  return (
    <div className="rastreame-espelho">
      <Toggle
        checked={ativo}
        onChange={(next) => void setAtivo(next)}
        disabled={loading || !config.editavelViaApi}
        label="Espelhar no Rastreame"
        aria-label="Espelhar no Rastreame"
      />
      {!config.editavelViaApi ? (
        <span className="rastreame-espelho__hint">via env</span>
      ) : (
        <span className={`rastreame-espelho__status ${ativo ? "is-on" : "is-off"}`}>
          {ativo ? "ligado" : "desligado"}
        </span>
      )}
    </div>
  );
}
