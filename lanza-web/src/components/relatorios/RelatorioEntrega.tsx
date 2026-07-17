import { LABEL } from "@/lib/labels";
import type { RelatorioModoEntrega } from "@/lib/relatorioDownload";

type Props = {
  loading?: boolean;
  disabled?: boolean;
  armazenarServidor: boolean;
  onArmazenarServidorChange: (value: boolean) => void;
  onEntrega: (modo: RelatorioModoEntrega) => void;
};

export function RelatorioEntrega({
  loading,
  disabled,
  armazenarServidor,
  onArmazenarServidorChange,
  onEntrega,
}: Props) {
  return (
    <section className="form-card relatorio-entrega">
      <h2 className="form-card__title">Entrega</h2>
      <label className="field checkbox-label relatorio-entrega__check">
        <input
          type="checkbox"
          checked={armazenarServidor}
          onChange={(e) => onArmazenarServidorChange(e.target.checked)}
          disabled={loading}
        />
        Armazenar no servidor
      </label>
      <p className="field__hint">
        Se marcado, grava ficheiros e espelha no armazenamento configurado (ex.: Vercel Blob).
      </p>
      <div className="relatorio-entrega__acoes">
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled || loading}
          onClick={() => onEntrega("visualizar")}
        >
          {loading ? LABEL.processando : "Visualizar"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={disabled || loading}
          onClick={() => onEntrega("txt")}
        >
          Download TXT
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={disabled || loading}
          onClick={() => onEntrega("pdf")}
        >
          Download PDF
        </button>
      </div>
    </section>
  );
}
