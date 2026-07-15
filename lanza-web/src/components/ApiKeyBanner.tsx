import { useState } from "react";
import { getStoredApiKey, setStoredApiKey } from "@/api/client";

export function ApiKeyBanner() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(getStoredApiKey);
  const hasKey = Boolean(getStoredApiKey().trim());

  function save() {
    setStoredApiKey(value);
    setOpen(false);
    window.location.reload();
  }

  if (!open && hasKey) return null;

  return (
    <div className="api-key-banner">
      <div>
        <strong>Autenticação da API</strong>
        <p>
          Se o servidor tiver <code>LANZA_API_KEY</code>, informe a chave abaixo.
          Ela é guardada apenas no seu navegador.
        </p>
      </div>
      {open || !hasKey ? (
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
        </div>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
          Alterar chave
        </button>
      )}
    </div>
  );
}
