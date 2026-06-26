# Cursor Agent Skills (projeto worklanza)

Skills em `.cursor/skills/<nome>/SKILL.md` são descobertas pelo Cursor neste repositório.

**Pastas operacionais (contratos, documentos, prestação de contas no disco):** ver `config/lanza_paths.json` e a regra `.cursor/rules/lanza-diretorios.mdc` (padrão `D:\Dropbox\Aluguel Carros` e `...\Financeiro`).

| Pasta | Função |
|-------|--------|
| `cadastrar-cliente` | CNH + comprovante → `database/clientes.json` (+ opcional Rastreame via **rastreame-site**). |
| `rastreame-site` | Especialista [rastreame.com.br](https://rastreame.com.br/): `rastreame` / `rastreame-gastos`; outras skills delegam a execução aqui. |
| `cadastrar-despesa` | Débitos do parceiro → `database/parceiro-despesas.json`. |
| `cadastrar-veiculo` | CRLV + Fipe + proprietário → `veiculos.json` / vínculos. |
| `gerar-contrato` | Contrato `.docx`/`.pdf`; `--placa` + `--cpf` lê database (cadastra se faltar). |
| `sync-seguro` | PDFs em `seguroComprovantesDir` → `parceiro-despesas.json`. |
| `relatorio-prestacao-contas` | Relatório mensal → pasta Financeiro (ver `lanza_paths.json`). |
| `cadastrar-recebimento` | Recebimentos no Rastreame — **Gastos Gerais** (regras `ATRASADO`, duplicados, parcial); execução: **rastreame-site**. |
| `encerrar-contrato` | Encerramento / devolução: multas, atrasos, diárias, retenção caução — CLI `encerrar-contrato`. |
| `sync-infracoes` | Infrações DETRAN SC → `database/cliente-despesas.json` (categoria Infração; API `transito-api`, frota em `veiculos.json`). |
| `sync-ipva-licenciamento` | IPVA e Licenciamento DETRAN SC → `database/parceiro-despesas.json`. |
| `renegociar-debitos` | Renegociação no Rastreame: total em aberto, `[NEGOCIADO X]`, parcelas DOCUMENTACAO; execução: **rastreame-site**. |

Toda a documentação técnica Rastreame (auth, `src/lib/rastreame/`, comandos CLI) está na skill **rastreame-site**.

**CLI TypeScript** em **`src/`**: na raiz do repo, `npm install` uma vez; invocar com `npx tsx src/run.ts …` (ver `README.md` na raiz).
