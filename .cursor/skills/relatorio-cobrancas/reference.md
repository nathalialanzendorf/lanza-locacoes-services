# Cobranças — referência

## Pagamento semanal em atraso

Fonte única da regra de negócio. Código: `src/lib/pagamentoSemanalCobranca.ts`.

### Quando aplicar

- Pagamento semanal **não realizado** (despesa `ATRASADO` em aberto).
- Operador pede valor devido, tabela de cobrança ou baixa integral com atraso.
- Skills **`relatorio-cobrancas`** e **`cadastro-recebimento`** referenciam aqui.

### Exemplo (Daniel MOBI — pagamento 04/07/2026)

Contrato: semanal R$ 650, diária atraso R$ 120 → juros e multa R$ 27,14/dia.

**Tabela 1** — venc. 27/06, período 27/06–03/07: todos **Atrasado** → total **R$ 840,00**.

**Tabela 2** — venc. 04/07, período 04/07–11/07: 04/07 **Atrasado**, demais **Em dia** → total **R$ 770,02**.

**Total geral:** **R$ 1.610,02**.

### Resumo da cobrança WhatsApp

Antes da tabela e da mensagem, apresentar (implementado em `formatResumoPorSemana`):

```
Data bloqueio: 30/06/2026
Base de cálculo: 04/07/2026

Vencimento em aberto: 27/06/2026
Juros e multa: R$ 189,98 (7 diárias)
Total semana: R$ 650,00

Vencimento em aberto: 04/07/2026
Juros e multa: R$ 27,14 (1 diária)
Valor semana: R$ 650,00

Total a devido : R$ 1.517,12 (8 dias em atraso)
```

Escalonamento (vencimento = D0):

| Data | WhatsApp |
|---|---|
| D0 | Sem mensagem (em prazo) |
| D+1 | Lembrete (dia 1) |
| D+2 | Aviso (dia 2) |
| D+3+ | Bloqueio (dia 3) |

- **Data bloqueio** = **3º dia contando o vencimento** (vencimento = dia 1 → bloqueio em vencimento **+ 2 dias**). Referência: **última** parcela em aberto no cálculo.
- **Juros e multa (por semana)** = soma dos dias **Atrasado** até a base de cálculo, **máx. 7 diárias por parcela** (só dentro da semana do vencimento).
- **Total semana / Valor semana (por semana)** = **valor semanal do contrato** (nominal).
- **Total a devido** = soma (valor semanal + juros/multa) por parcela em aberto.
- **Total geral** da tabela diária permanece no detalhe markdown; **`totalGeral`** do pacote = total a devido (baixa integral).

### Integração cadastro-recebimento

Ao montar `baixa-recebimento plano` para quitação integral de parcelas em atraso:

1. Rodar `relatorio-cobrancas semanal-atraso` com a **data do pagamento** prevista.
2. Usar **`totalGeral`** (ou soma das tabelas) como `--valor` na baixa.
3. Tabela de confirmação Rastreame continua no formato da skill cadastro-recebimento.

Não usar só `valorSemanal` da despesa quando houver juros e multa acumulados.

---

## JSON sidecar para canvas (`cobranca-*.json` / `cobranca-simples-*.json`)

### Modo completo (`tipo: "cobranca"`)

Gerado com escopo **contrato** (lote sem filtro, ou `--cliente`).

### Modo simples (`tipo: "cobranca-simples"`)

**Exceção — só `infracoes` sem cliente/placa:** não usa `cobranca-simples`.
- Padrão: `relatorio-infracoes-{data}.json` (`tipo: "relatorio-infracoes"`) — completo (blocos)
- Com `resumido` / `--canvas-infracoes resumido`: `relatorio-infracoes-resumido-{data}.json` — cobráveis por veículo
- Com `ambos` / `--canvas-infracoes ambos`: os dois sidecars

| Filtro CLI | `modo` no JSON | Agrupamento (`grupos[]`) |
|---|---|---|
| Só **tipo** (ex. `pedagio`) | `por-tipo` | Um grupo por **placa** — `titulo`: `{PLACA} · {marca/modelo} ({ano})` |
| Só **`--placa`** | `por-placa` | Um grupo por **tipo de despesa** — `titulo`: rótulo do tipo |

Cada grupo: `linhas[]` com `descricao`, `placa`, `data`, `categoria`, `valor` + `total`. Raiz: `titulo`, `totalGeral`, `geradoEmBr`.

Gerado em `relatorios/_tmp/cobrancas/` pela CLI em **qualquer** execução com alvos elegíveis:
- **`--cliente`** ou **`--placa`**: um sidecar para o escopo filtrado.
- **Sem parâmetros** (todos): um sidecar **por cliente** (todas as placas/débitos do locatário, como `--cliente`).

Formato **próprio** de cobranças — distinto do sidecar `encerramento-contrato-*.json`.

Implementação: `src/lib/cobrancasRelatorioSidecar.ts` · função `coletarTodasDespesasAbertas()`.

### Despesas incluídas

**Sempre todas em aberto** no escopo:

| Escopo | Inclui |
|---|---|
| `--cliente` | Toda despesa em aberto em que o locatário é responsável (`condutorId`, infração inferida ou contrato ativo da placa) — **qualquer placa** |
| `--placa` | Toda despesa em aberto da placa |

**Excluídas:** categoria **Quebra contrato**, retenção por quebra, linhas **CRÉDITO** / devolução, despesas pagas ou inativas.

A classificação nas tabelas segue a categoria: **Infração** · **Manutenção** · **Locação semanal** · demais em **Outros valores** (pedágio, estacionamento, renegociação, caução pendente, etc.).

As mensagens WhatsApp do sidecar são **pagamento semanal** (com resumo de juros) + **despesas em aberto** unificada quando o escopo inclui vários tipos ou todos. Tipos dedicados (multa, pedágio, …) permanecem separados quando aplicável. **Manutenção** não gera WhatsApp duplicado se a mensagem unificada já lista os itens.

### Campos principais

| Campo | Descrição |
|---|---|
| `cliente`, `placa`, `modeloVeiculo`, `anoModelo` | Cabeçalho do canvas |
| `geradoEmBr` / `dataAtual` | Data de geração (DD/MM/AAAA) |
| `dataInicio`, `dataFim`, `qtdDiasContrato` | Vigência do contrato vigente |
| `qtdDiasLocado` | Dias desde o início do contrato até `dataAtual` |
| `contrato.valorSemanal`, `contrato.valorDiaria` | Stats (não incluir `valorCaucao`) |
| `infracoes[]` | Linhas `{ descricao, … }` — **`descricao` = `titulo` da despesa** (não o texto DETRAN) |
| `manutencoes[]` | Idem |
| `parcelasEmAberto[]` | Locação semanal ATRASADO em aberto |
| `debitosDiversos[]` | Pedágio, estacionamento, renegociação (exclui **Quebra contrato**) |
| `pagamentoSemanal` | Payload da tabela dia a dia (`pagamentoSemanalCobranca.ts`) |
| `resumoSemanal` | Resumo WhatsApp quando em atraso (D+1…) |
| `totalDebitos` | Soma de todos os subtotais — **destaque do canvas** |
| `despesasEmAberto[]` | Dados brutos para mensagem WhatsApp (não renderizados como tabela no canvas) |
| `totalDespesasEmAberto` | Soma nominal das despesas em aberto |
| `mensagensWhatsApp[]` | `{ tipo, placa, titulo, texto }` — pagamento semanal + despesas em aberto (escopo completo); manutenção só quando `--tipo manutencao` isolado |
| `avisos[]` | Operador (ex.: semana em prazo) |

### Formato WhatsApp — despesas em aberto (unificada)

### Subtotais

```
totalInfracoes + totalManutencoes + totalParcelasEmAberto + totalDebitosDiversos = totalDebitos
```

### O que NÃO incluir (só encerramento / quebra)

- `retencaoCaucao`, `caucaoDevolver`, `saldoFinal`
- `creditosDevolucao`, `totalCreditos`
- `linhaQuebraContrato`
- Despesas categoria **Quebra contrato** ou retenção proporcional de caução

### Regra de exibição do cálculo (juros/multa)

| Situação | Exibir tabela |
|---|---|
| Parcela **em aberto** (não paga) | **Sim** — inclui D0 (vencimento hoje) |
| Pagamento **após** o vencimento | **Sim** |
| Pagamento **no** vencimento | **Não** |

Implementação: `deveExibirCalculoSemanalAtraso()` e `filtrarVencimentosCalculoSemanal()` em `pagamentoSemanalCobranca.ts`. O plano de baixa (`baixa-recebimento plano`) expõe `calculoSemanalAtraso` no JSON com a mesma regra.

### Saída obrigatória (CLI + canvas)

Ao fim de **cada** relatório (`--cliente` ou `--placa`), quando existir parcela semanal **ATRASADO** em aberto **ou** tipo **pagamento-semanal** com alvos:

| Bloco | Conteúdo |
|---|---|
| Resumo | `resumoSemanal` + `formatResumoPorSemana` — bloqueio, base de cálculo, juros/total por semana, total a devido |
| Tabelas | `pagamentoSemanal.tabelas[]` — **uma por vencimento**; subtotais + `totalGeral` |
| WhatsApp | `mensagensWhatsApp[]` — **pagamento semanal** (com juros) + **despesas em aberto** unificada; arquivos `cobranca-*-whatsapp-{tipo}.txt`. Sem WhatsApp separado de **manutenção** quando a unificada está presente (`--tipo manutencao` isolado mantém mensagem dedicada). |

Com vários tipos no mesmo escopo, as tabelas semanal-atraso entram **se** houver débito semanal ATRASADO, independentemente do filtro de tipo.

**Não** incluir tabela consolidada "Despesas em aberto" no fim — débitos já aparecem no início (infrações, manutenção, parcelas, outros).

### Formato WhatsApp — despesas em aberto

Template: `templates/cobrancas/despesas-em-aberto.txt`

Implementação: `gerarDespesasEmAberto()` em `cobrancas.ts` · `montarMensagensWhatsAppEscopo()` em `cobrancasRelatorioSidecar.ts`.

WhatsApp não renderiza markdown. Use linhas com bullets (`• placa · descrição · valor`) e totais em negrito (`*…*`) só em **Total semana**, **Valor semana** e **Total a devido**. O **total em aberto** soma valores nominais das despesas; o bloco semanal distingue **total a devido** (soma dos totais semanais / `totalGeral`) via `formatResumoPorSemana()`.

Sidecar: `garantirPagamentoSemanalSidecar()` recalcula `pagamentoSemanal`/`resumoSemanal` a partir das despesas quando o lote não rodou pagamento-semanal.

### Canvas

Layout **próprio** em `templates/canvas/cobranca.layout.tsx` (cópia inicial do encerramento; ficheiros independentes). Gerador: `scripts/gen-cobranca-canvas.mjs` — grava em `canvases/` **e copia** para `~/.cursor/projects/d-Dropbox-Aworklanza/canvases/` (só o IDE abre daí).

Adaptações face ao encerramento:

- Título **Relatório de cobranças** · vigência + **Gerado em** (ver `dataInicio`, `dataFim`, `qtdDiasContrato`, `dataAtual`, `qtdDiasLocado`)
- Destaque **Total a cobrar** (não saldo caução)
- 2 stats (semanal + diária atraso)
- Secções iniciais: infrações, manutenção, parcelas, outros (despesas em aberto por categoria)
- Sem créditos, quebra ou saldo caução
- Secções extra: **Pagamento semanal em atraso** (resumo por semana + tabelas), **Mensagens WhatsApp** (cards separados, fim)
