type Props = {
  title?: string;
  whatsapp?: string;
  texto?: string;
  data?: unknown;
  arquivos?: unknown;
};

export function ResultPanel({ title = "Resultado", whatsapp, texto, data, arquivos }: Props) {
  if (!whatsapp && !texto && data == null) return null;

  return (
    <section className="result-panel">
      <h2 className="result-panel__title">{title}</h2>
      {whatsapp ? (
        <div className="result-panel__block">
          <h3>WhatsApp</h3>
          <pre className="result-panel__pre">{whatsapp}</pre>
        </div>
      ) : null}
      {texto ? (
        <div className="result-panel__block">
          <h3>Texto</h3>
          <pre className="result-panel__pre">{texto}</pre>
        </div>
      ) : null}
      {data != null ? (
        <div className="result-panel__block">
          <h3>Dados</h3>
          <pre className="result-panel__pre">{JSON.stringify(data, null, 2)}</pre>
        </div>
      ) : null}
      {arquivos != null ? (
        <div className="result-panel__block">
          <h3>Arquivos</h3>
          <pre className="result-panel__pre">{JSON.stringify(arquivos, null, 2)}</pre>
        </div>
      ) : null}
    </section>
  );
}
