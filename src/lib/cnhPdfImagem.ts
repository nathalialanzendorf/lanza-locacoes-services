/**
 * Extrai JPEGs embutidos de PDF de CNH-e (SENATRAN costuma gravar a carteira como imagem).
 * Mesma lógica de `.cursor/tools/init-database/extrair-jpg-cnh.ts`.
 */
const MIN_JPEG_BYTES = 5000;

export function extrairJpegsEmbutidosPdf(buffer: Buffer): Buffer[] {
  const out: Buffer[] = [];
  let i = 0;
  while (i < buffer.length - 1) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
      let j = i + 2;
      while (j < buffer.length - 1 && !(buffer[j] === 0xff && buffer[j + 1] === 0xd9)) j++;
      if (j < buffer.length - 1) {
        const end = j + 2;
        const slice = buffer.subarray(i, end);
        if (slice.length >= MIN_JPEG_BYTES) out.push(Buffer.from(slice));
        i = end;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** O JPEG maior costuma ser a frente da CNH (ignora ícones/thumbnails). */
export function escolherImagemCnh(buffers: Buffer[]): Buffer | null {
  if (!buffers.length) return null;
  return buffers.reduce((best, cur) => (cur.length > best.length ? cur : best));
}
