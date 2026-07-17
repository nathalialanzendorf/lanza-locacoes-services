import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";

export function RastreameEspelhoToggle() {
  const { ativo, config, loading, setAtivo } = useRastreameEspelho();

  if (!config) return null;

  return (
    <div className="rastreame-espelho">
      <label className="rastreame-espelho__label" title="Fonte da verdade: Lanza (database). Rastreame é espelho opcional.">
        <input
          type="checkbox"
          checked={ativo}
          disabled={loading || !config.editavelViaApi}
          onChange={(e) => void setAtivo(e.target.checked)}
        />
        <span>Espelhar no Rastreame</span>
      </label>
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
