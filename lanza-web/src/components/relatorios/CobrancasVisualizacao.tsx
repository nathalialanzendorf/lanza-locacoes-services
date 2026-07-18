import { useMemo } from "react";

import { extrairBlocosCobrancas } from "@/lib/relatorioDownload";

type Props = {
  data: unknown;
  rotulos?: Record<string, string>;
};

export function CobrancasVisualizacao({ data, rotulos }: Props) {
  const blocos = useMemo(() => extrairBlocosCobrancas(data, rotulos), [data, rotulos]);
  const total = blocos.reduce((n, b) => n + b.mensagens.length, 0);

  if (!total) return null;

  return (
    <section className="result-panel cobrancas-vis">
      <h2 className="result-panel__title">Visualização</h2>
      {blocos.map((bloco) =>
        bloco.mensagens.length ? (
          <div key={bloco.tipo} className="cobrancas-vis__tipo">
            <h3 className="cobrancas-vis__tipo-titulo">
              {bloco.rotulo}
              <span className="cobrancas-vis__contagem">{bloco.mensagens.length}</span>
            </h3>
            {bloco.mensagens.map((msg, i) => (
              <div key={`${bloco.tipo}-${i}`} className="cobrancas-vis__mensagem">
                {msg.cliente || msg.placa ? (
                  <p className="cobrancas-vis__meta">
                    {[msg.cliente, msg.placa].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                <pre className="result-panel__pre">{msg.texto}</pre>
              </div>
            ))}
          </div>
        ) : null,
      )}
    </section>
  );
}
