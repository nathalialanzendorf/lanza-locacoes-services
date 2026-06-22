# Cursor Agent Skills (projeto worklanza)

Skills em `.cursor/skills/<nome>/SKILL.md` são descobertas pelo Cursor neste repositório.

**Pastas operacionais (contratos, documentos, prestação de contas no disco):** ver `config/lanza_paths.json` e a regra `.cursor/rules/lanza-diretorios.mdc` (padrão `D:\Dropbox\Aluguel Carros` e `...\Financeiro`).

| Pasta | Função |
|-------|--------|
| `contrato` | Preencher LOCATÁRIO no modelo Word v3 (fluxo manual / XML). |
| `cadastrar-cliente` | CNH + comprovante → `database/clientes.json` (+ opcional Rastreame via **rastreame-site**). |
| `rastreame-site` | Especialista [rastreame.com.br](https://rastreame.com.br/): `rastreame` / `rastreame-gastos`; outras skills delegam a execução aqui. |
| `cadastrar-despesa` | Lançamento manual → `database/despesas.json`. |
| `cadastrar-veiculo` | CRLV + Fipe + proprietário → `veiculos.json` / vínculos. |
| `gerar-contrato` | Contrato completo `.docx`/`.pdf` via CLI em `src/` (saída em `contratosDir` do JSON de config). |
| `importar-boletos-seguro` | PDFs em `seguroComprovantesDir` (`config/lanza_paths.json`, padrão `Proteção Veicular\Comprovantes\2026`) → `despesas.json`. |
| `relatorio-prestacao-contas` | Relatório mensal → pasta Financeiro (ver `lanza_paths.json`). |
| `cadastrar-recebimento` | Recebimentos no Rastreame — **Gastos Gerais** (regras `ATRASADO`, duplicados, parcial); execução: **rastreame-site**. |

Toda a documentação técnica Rastreame (auth, `src/lib/rastreame/`, comandos CLI) está na skill **rastreame-site**.

**CLI TypeScript** em **`src/`**: na raiz do repo, `npm install` uma vez; invocar com `npx tsx src/run.ts …` (ver `README.md` na raiz).
