import { useState } from "react";
import { getStoredApiKey, setStoredApiKey } from "@/api/client";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ApiKeyBanner({ open, onClose }: Props) {
  const [value, setValue] = useState(getStoredApiKey);
  const hasKey = Boolean(getStoredApiKey().trim());

  if (!open) return null;

  function save() {
    setStoredApiKey(value);
    onClose();
    window.location.reload();
  }

  return (
    <div className="api-key-banner">
      <div>
        <strong>Autenticação da API</strong>
        <p>
          Se o servidor tiver <code>LANZA_API_KEY</code>, informe a chave abaixo.
          Ela é guardada apenas no seu navegador.
        </p>
      </div>
      <div className="api-key-banner__form">
        <input
          type="password"
          placeholder="X-API-Key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        <button type="button" className="btn btn--primary" onClick={save}>
          Guardar
        </button>
        {hasKey ? (
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
        ) : null}
      </div>
    </div>
  );
}
