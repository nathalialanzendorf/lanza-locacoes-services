---
name: cadastro-recebimento
description: >-
  CRUD client debits and rental receipts on rastreame.com.br Gastos Gerais: weekly payments,
  maintenance (franquia, lavação, óleo/pneu → Manutenção/ALIMENTACAO), settlements, invoices.
  Modes: gravar-cliente-despesa, baixa unitária (cliente + valor + data), or PagBank batch.
  Requires operator confirmation (Sim/Não per line) before writes. Use for despesa cliente,
  acionamento franquia, recebimento locação, pagamento semanal, baixa PagBank.
---

# Cadastro de recebimento (Rastreame — Gastos gerais)

Skill para **cadastrar, editar e excluir** **despesas do cliente** e recebimentos de locação no
**Rastreame** (Gastos Gerais).

## Acionamento de franquia (sempre aqui — nunca parceiro)

**Acionamento de franquia** é **sempre despesa do cliente**, categoria **`Manutenção`**, tipo
Rastreame **`ALIMENTACAO`**. Gravar em `cliente-despesas.json` via **`gravar-cliente-despesa`**
e espelhar em Gastos Gerais — **não** usar skill **`cadastro-despesa`** / `parceiro-despesas.json`.

Exemplo de lançamento em aberto:

```powershell
# lote.json: veiculoId (placa), clienteDespesas[] com categoria Manutenção, rastreameTipo ALIMENTACAO
npx tsx src/run.ts gravar-cliente-despesa lote.json
npx tsx src/run.ts gravar-cliente-despesa confirmar <autoInfracao> <clienteId>
```

Descrição típica: `Acionamento Franquia` (nasce com prefixo **`ATRASADO`** se em aberto).

## Formato das descrições — caução (parcelamento)

> **Fonte única** desta regra para lançamentos de caução em `cliente-despesas.json` / Gastos Gerais.
> A skill **`cadastro-contrato`** define datas e valores no Word; ao **cadastrar as despesas**,
> seguir **sempre** este formato aqui.

### Entrada na retirada (sem sufixo)

Quando o locatário paga parte ou total da caução **na retirada**, sem número de parcela:

| Situação | Descrição | Tipo Rastreame |
|----------|-----------|----------------|
| Pago | `Pagamento caução` | **OUTROS** |
| Em aberto (raro) | `ATRASADO Pagamento caução` | **OUTROS** |

### Parcelas de caução (saldo em aberto ou diluído)

O sufixo numérico segue **`{parcelaAtual}x{totalParcelas}`** — igual à renegociação
(`Pagamento negociação - 4x26`). O **segundo número é o total de parcelas**, **não** o dia do mês.

| Situação | Descrição | Exemplo (7 parcelas) |
|----------|-----------|----------------------|
| Em aberto | `ATRASADO Pagamento caução - {n}x{N}` | `ATRASADO Pagamento caução - 1x7` |
| Quitada | `Pagamento caução - {n}x{N}` | `Pagamento caução - 3x7` |

**Exemplo completo** — caução R$ 1.500, R$ 450 na retirada (03/07), saldo 7× R$ 150, pagamento **sábados**:

1. `Pagamento caução` · R$ 450 · **03/07/2026** · **pago** (retirada)
2. `Pagamento semanal - Sábado 04` · R$ 650 · **03/07/2026** · **pago** (1.ª semana na retirada — data real do pagamento, não o sábado da descrição)
3. `ATRASADO Pagamento semanal - Sábado 11` · R$ 650 · 11/07/2026 (próxima semana em aberto)
4. `ATRASADO Pagamento caução - 1x7` · R$ 150 · **11/07/2026** ← **1.ª parcela de caução**
5. `ATRASADO Pagamento caução - 2x7` · R$ 150 · 18/07/2026
6. … até `ATRASADO Pagamento caução - 7x7` · R$ 150 · 22/08/2026

### Calendário — parcelamento **inicia na semana seguinte**

A **1.ª parcela de caução em aberto** vence sempre na **semana seguinte** ao início do contrato / retirada — **não** no mesmo dia da retirada nem no 1.º sábado imediato se a retirada for antes dele com semanal já paga.

| Evento | Quando cadastrar |
|--------|------------------|
| Entrada de caução paga | Data da **retirada** |
| 1.ª semana paga na retirada | Data **real** do pagamento (retirada) |
| **1.ª parcela de caução (`1xN`)** | **1.º dia de pagamento da semana seguinte** (ex.: 1.º sábado após retirada → 11/07 se retirada 03/07) |
| Parcelas seguintes (`2xN` …) | Mesmo dia da semana, +7 dias cada |

**Proibido** antecipar a 1.ª parcela de caução para a mesma data da 1.ª semanal ou da retirada.

**Proibido** usar o dia do mês no sufixo (ex.: `1x04`, `2x11`) — isso **não** é o padrão Lanza.

Helper TypeScript: `infoParcelaCaucao(n, total, { atrasado })` e `gerarDatasParcelasCaucao(inicio, parcelas, diaPagamento)` em `src/lib/caucaoParcelas.ts`.

Ao dar baixa numa parcela, **remover `ATRASADO`** (mesma regra do pagamento semanal).

## Modos de entrada (como invocar)

A skill tem **dois modos**. Em ambos, a **confirmação Sim/Não por linha** antes de gravar é **obrigatória** (ver secção seguinte).

### Modo unitário — cliente + valor + data

Quando o operador informa **cliente**, **valor** e **data/hora** de pagamento (ex.: `/cadastro-recebimento Virginia 650 18/06 as 06:10`):

1. Correr **`baixa-recebimento plano`** para montar o plano (não grava):

```powershell
npx tsx src/run.ts baixa-recebimento plano --cliente "Virginia" --valor 650 --data 18/06/2026 --hora 06:10 [--comprovante "texto"] [--desconto] --json
```

2. Apresentar a tabela de confirmação com **todas** as linhas do JSON (`linhas[]`): quitação da despesa em aberto **e** próxima parcela `ATRASADO` gerada automaticamente.
3. Pedir **Sim/Não por linha** (#1, #2, …).
4. Gravar só linhas confirmadas: `gravar-cliente-despesa editar <autoInfracao> <patch.json>` (atualizar) — o **push ao Rastreame é automático** após gravar localmente.
5. Se `--comprovante` foi informado, após a gravação fazer **PUT** no gasto Rastreame com campo `comprovante` (ver `reference.md`).

**Regras automáticas do plano:**

| Situação | Tipo de baixa | O que o plano inclui |
|----------|---------------|----------------------|
| Valor pago = valor devido | **integral** | 1× atualizar (quitar) + 1× criar próxima parcela |
| Valor pago < devido, sem desconto | **parcial** | 1× atualizar saldo em atraso + 1× criar linha do valor pago + **1× criar próxima parcela ATRASADO** |
| Valor pago < devido + `--comprovante` ou `--desconto` | **integral_desconto** | 1× atualizar com valor ajustado + próxima parcela |

### Valor devido com atraso (pagamento não realizado)

Quando houver parcela(s) **ATRASADO** em aberto, **não** usar só o `valorMulta` da despesa
(R$ semanal fixo). O plano de baixa (`baixa-recebimento plano --json`) inclui automaticamente
**`calculoSemanalAtraso`** com tabelas dia a dia e **`totalGeral`** — exceto quando o pagamento
é **na data de vencimento** (nesse caso o campo vem omitido/`null`).

Regra de exibição:

| Situação | Exibir cálculo |
|----------|----------------|
| Parcela em aberto (não paga) | **Sim** (base = hoje ou `--data-pagamento`) |
| Pagamento **após** o vencimento | **Sim** |
| Pagamento **no** vencimento | **Não** |

Usar o **`totalGeral`** de `calculoSemanalAtraso` como `--valor` na baixa quando houver juros.
Comando manual (opcional):

```powershell
npx tsx src/run.ts relatorio-cobrancas semanal-atraso --cliente "Nome" --data-pagamento DD/MM/AAAA --no-salvar
```

Detalhe em `.cursor/skills/relatorio-cobrancas/reference.md`.

### Formato da descrição — multa de atraso (juros semanal)

> **Fonte única** desta regra para a linha de **juros/multa** vinculada a uma parcela semanal
> em atraso — separada da parcela nominal (`Pagamento semanal - …`).

Quando o pagamento semanal é feito **com atraso**, os juros/multa são lançados como **despesa
própria** (categoria `Locação semanal`, tipo Rastreame **OUTROS**), **não** embutidos na
parcela semanal.

| Situação | Descrição | Tipo Rastreame |
|----------|-----------|----------------|
| Em aberto | `ATRASADO Multa atraso ({N} dias) pagamento semanal - {DiaSemana} {DD}` | **OUTROS** |
| Quitada | `Multa atraso ({N} dias) pagamento semanal - {DiaSemana} {DD}` | **OUTROS** |

- **`{N}`** — dias **Atrasado** da tabela `calculoSemanalAtraso` da parcela vinculada (máx. 7).
- **`{DiaSemana} {DD}`** — mesmo sufixo da parcela semanal (ex.: `Quarta 08`).
- **`pagamento semanal`** em minúsculas; hífen **antes** do dia da semana.
- **`{DD}`** com 2 dígitos (zero à esquerda).

**Proibido** usar o formato antigo `Juros e multa - Pagamento semanal …` em lançamentos novos.

**Exemplo (Tiago — Quarta 08, 3 diárias):**

`ATRASADO Multa atraso (3 dias) pagamento semanal - Quarta 08`

Helper: `montarDescricaoMultaAtrasoSemanal(n, parsed, { atrasado })` em `src/lib/pagamentoSemanal.ts`.

**Fluxo na baixa com atraso:**

1. Baixar a **parcela semanal nominal** (`--valor` = valor semanal do contrato).
2. Se `calculoSemanalAtraso` tiver juros > 0, **cadastrar ou atualizar** a linha de multa de
   atraso com o título acima e valor = juros da tabela (confirmar Sim/Não).
3. Ao **quitar** a multa de atraso, remover `ATRASADO` (mesma regra do pagamento semanal).

Parâmetros opcionais:

- **`--comprovante "…"`** — texto gravado no campo `comprovante` do Rastreame (ex.: desconto diária de manutenção).
- **`--desconto`** — força baixa integral mesmo quando valor pago < devido.

### Modo lote — extrato PagBank (sem parâmetros de pagamento)

Quando o operador invoca **`/cadastro-recebimento`** **sem** cliente/valor/data (ex.: “baixar recebimentos do PagBank”):

1. Garantir **`PAGBANK_AUTH`** (e opcionalmente `PAGBANK_COOKIE`) — ver tool `.cursor/tools/pagbank/`.
2. Correr **`pagbank match`** (últimos 30 dias por defeito, ou `--inicio` / `--fim`):

```powershell
npx tsx src/run.ts pagbank match [--inicio 2026-05-31] [--fim 2026-06-29] --json
```

(Alias: `baixa-recebimento pagbank` — mesmo resultado.)

3. Para **cada** item em `planos[]` do JSON (**ordem: do PIX mais recente ao mais antigo**):
   - Mostrar crédito PagBank (valor, data, descrição, confiança do match).
   - Se `jaBaixado` / `idempotencia.status` ≠ `ok`: avisar **provável duplicata** — confirmar com **Não** salvo se o operador não tiver certeza.
   - Mostrar tabela de confirmação das `linhas` desse plano.
   - Pedir **Sim/Não por linha** desse pagamento antes de gravar.
4. Itens em **`semMatch`** — listar ao operador; tratar manualmente no **modo unitário** ou ignorar.
5. Após Sim: gravar + push Rastreame (igual ao modo unitário).

**Cruzamento PagBank → cliente:** nome na descrição / **pagador PIX** vs `clientes.json` (ativos); data do recebimento vs vencimento previsto (semanal: −7 a +14 dias); valor compatível. Ignora vendas (cartão).

**⚠️ Juliano / Laryssa / Gustavo (FOCUS):** PIX pode vir de **qualquer um dos três** e quitar débitos de **Juliano** ou do contrato **Gustavo/Laryssa** (vice-versa). O lote gera **dois candidatos** sempre; confirme motorista titular e despesa alvo. **Juliano** no lote **não** casa multas automaticamente; confiança limitada + revisão manual. Preferir **`baixa-recebimento plano --cliente …`** quando ambíguo.

**⚠️ Jennifer / Arlem (HB20 Regiane):** PIX pode vir da **Jennifer** ou do **Arlem** e quitar débitos de **qualquer um** (vice-versa). Dois candidatos + revisão manual; confirme titular e despesa alvo; idempotência (`jaBaixado`) antes de gravar.

> **Nunca** colar tokens PagBank no repositório. Capturar `authorization` no DevTools e gravar em variável de ambiente do utilizador.


> **Esta seção é a fonte única da regra da tag `ATRASADO` para despesa de cliente.**
> Outras skills/docs que criam, dão baixa ou listam despesa de cliente (ex.: `sync-pedagios`,
> `sync-infracoes`, tool `.cursor/tools/rastreame/`) **referenciam aqui**, sem repetir a regra.

- **`ATRASADO`** — incluída **por padrão** ao lançar uma despesa de cliente **em aberto**
  no Gastos Gerais (ex.: `ATRASADO Pagamento semanal - Sábado 27`). Ao **dar baixa/quitar**,
  remover `ATRASADO` do `info` (ver "Pagamento integral/parcial" abaixo).
- **`[NEGOCIADO X]`** — tag de renegociação; a regra completa é da skill **`renegociar-debitos`**
  (fonte única dessa tag). ⚠️ Ao aplicar `[NEGOCIADO X]`, **remover `ATRASADO`** — o débito
  deixou de estar em atraso (passou a negociado); não manter as duas juntas. Ex.:
  `ATRASADO Pagamento semanal - Sábado 27` → `[NEGOCIADO 2] Pagamento semanal - Sábado 27`.

> Reutilização: ao **dar baixa** num pagamento (**integral ou parcial**), esta skill já **cria automaticamente a
> próxima despesa** de cliente — que nasce com `ATRASADO` por padrão, conforme a regra acima.
> Mesmo que reste saldo em aberto na semana atual, a parcela da **semana seguinte** é lançada.

## ⚠️ Confirmação obrigatória antes de gravar (sim / não)

**Nunca** cadastrar, editar ou dar baixa em `database/cliente-despesas.json` **sem confirmação
explícita do operador** — mesmo que valor, cliente e parcela pareçam óbvios.

### Fluxo (ordem fixa)

1. **Montar o plano** — identificar cliente, veículo, despesas em aberto e como o pagamento
   (integral/parcial) ou o cadastro novo altera cada registo (PUT, POST ou exclusão lógica).
2. **Apresentar pré-visualização** — tabela com **todos** os registos que serão
   **criados ou atualizados** (estado **depois** da operação), nas colunas abaixo.
3. **Pedir confirmação via seletor — registro a registro** — após a tabela completa, usar a
   ferramenta de perguntas **uma vez por linha** (cada registo a criar ou atualizar), com opções
   **Sim** / **Não** (e **Outro** para ajustar só aquela linha). Numere as linhas (#1, #2, …)
   e indique a operação (**atualizar** / **criar**). **Só gravar as linhas confirmadas com Sim.**
   Se alguma linha for **Não**, omiti-la do lote (remontar plano se o operador pedir).
4. **Só após Sim em cada linha a executar** — gravar no `database/cliente-despesas.json`
   (`gravar-cliente-despesa`), **linha a linha ou em lote só com as confirmadas**.
5. **Em seguida** — espelhar no Rastreame (push) **dos registos confirmados e gravados**.

> **Proibido** executar passos 4–5 antes da confirmação **de cada registo** incluído no lote.
> Não “adiantar” a baixa local para “depois espelhar” sem o operador ter confirmado cada linha.

### Tabela de confirmação (obrigatória)

Incluir **cada linha** que será escrita ou alterada (ex.: quitação integral = 1 linha editada;
pagamento parcial = linha do saldo em atraso **e** linha do valor pago). Colunas **nesta ordem**:

| Rastreável | Data | Descrição | Motorista | Tipo | Total |
|---|---|---|---|---|---|

- **Rastreável:** `rastreameLabel` de `veiculos.json`.
- **Data:** `DD/MM/AAAA` (data/hora do pagamento ou vencimento conforme a regra do caso).
- **Descrição:** texto final em `info` / `descricao` (**sem** `ATRASADO` se quitado).
- **Motorista:** nome do condutor.
- **Tipo:** de-para Rastreame (secção abaixo).
- **Total:** valor em `R$` **após** a operação.

Fechar com linha **Total** somando os valores da pré-visualização (útil quando há várias
linhas). Se houver **edição + novo registo** no mesmo pagamento, **todas** as linhas entram na
mesma tabela; a confirmação é **por linha** (secção seguinte).

### Seletor — um por registo (obrigatório)

Para **cada linha** da tabela, perguntar separadamente, citando #N, operação e descrição. Ex.:

*“#1 — **Atualizar** → Pagamento semanal - Sexta 26 · R$ 34,00. Confirmar?”*

Opções por linha: **Sim (confirmar este registo)** | **Não (não gravar este)**.

Opcional: após todas as linhas, resumo *“Gravar N registo(s) confirmado(s) no database e Rastreame?”*
só se quiser validação final — a regra mínima é **Sim/Não em cada linha** antes de qualquer
`gravar-cliente-despesa` ou `POST`/`PUT`.

Se **Não** numa linha, não a incluir no lote. Se o operador pedir correção numa linha, remontar
só essa linha e perguntar de novo.

## ⚠️ Regra: gravar no database **e** enviar ao Rastreame (obrigatório)

**Sempre** que o operador pedir um cadastro de **despesa do cliente**, o fluxo completo é:

1. **Confirmação** — tabela + seletor Sim/Não (secção anterior).
2. **Salvar** no `database/cliente-despesas.json` — **somente após Sim**.
3. **Push ao Rastreame** — **automático** ao concluir o passo 2 (`gravarClienteDespesa`,
   `editarClienteDespesa`, `sincronizarClienteDespesa`, etc. disparam o sync por defeito).

O módulo `clienteDespesasDb` replica no Rastreame (Gastos Gerais) **logo após** persistir
localmente — inclui a **próxima parcela semanal** auto-criada na baixa. Opt-out só com
`syncRastreame: false` ou `--no-sync-rastreame` na CLI.

Não deixar a despesa **só local**. Se faltar token do Rastreame, **pedir as credenciais**
(ver tool `.cursor/tools/rastreame/`) — o cadastro só está completo quando espelhado no
Rastreame. Obter token **sempre** das variáveis de ambiente do utilizador
(`RASTREAME_AUTH` ou `RASTREAME_LOGIN` + `RASTREAME_SENHA`).

## Operações

| Operação | Como |
|----------|------|
| **Cadastrar** | `rastreame-gastos post` (após checar duplicado) |
| **Editar** | `rastreame-gastos put <id>` |
| **Excluir** | Via UI Rastreame ou API conforme `.cursor/tools/rastreame/` |

**Listagem (UI):** [Gastos — listagem](https://rastreame.com.br/#/gastos/list)

## Formato ao listar despesas do cliente (obrigatório)

> Terminologia: referir-se **sempre** a estes lançamentos como **"despesas do cliente"**
> (não "pendências" nem "débitos do cliente").

**Sempre** que o operador pedir as **despesas do cliente** (dados de `cliente-despesas.json`),
**ou** quando for montar a **tabela de confirmação** antes de cadastrar/editar, retornar uma
tabela com **exatamente estas colunas, nesta ordem** (iguais ao cadastro de
Gastos Gerais do Rastreame):

| Rastreável | Data | Descrição | Motorista | Tipo | Total |
|---|---|---|---|---|---|

- **Rastreável:** rótulo do veículo (`rastreameLabel` de `veiculos.json`, ex.: `OZC-0B50 - OZC0B50 - FOCUS (Felipe)`).
- **Data:** `DD/MM/AAAA` (data do lançamento / autuação).
- **Descrição:** texto do `info` / descrição.
- **Motorista:** nome do condutor.
- **Tipo:** tipo do Rastreame conforme o de-para abaixo.
- **Total:** valor em `R$`.

Fechar com a linha de **Total** somando as despesas.

### De-para do **Tipo** (Gastos Gerais do Rastreame)

A coluna **Tipo** segue este mapeamento (categoria interna → Tipo no Rastreame):

| Tipo (Rastreame) | O que é | Categoria interna |
|---|---|---|
| **DOCUMENTACAO** | Renegociações | `Renegociação` |
| **OUTROS** | Cobrança semanal e caução | `Locação semanal`, `Caução` |
| **PEDAGIO** | Pedágio e estacionamento rotativo | `Pedágio`, `Estacionamento` |
| **MULTA** | Infrações | `Infração` |
| **ALIMENTACAO** | Manutenção de responsabilidade do cliente (troca de óleo, troca de pneu, acionamento de franquia, lavação) | `Manutenção` |

## Autenticação e execução no site

- **Nunca** colar tokens JWT, cookies ou `curl` com sessão no repositório.
- **Auth** (`RASTREAME_*`) e **comandos** no site: tool `.cursor/tools/rastreame/` (referência técnica).

## API (REST) — referência

- Base: `https://rastreame.com.br/keek/rest/gasto/`
- **Novo:** `POST` `https://rastreame.com.br/keek/rest/gasto/` com JSON no corpo.
- **Atualizar:** `PUT` `https://rastreame.com.br/keek/rest/gasto/{id}` com corpo que inclua `id` e campos a manter/atualizar (espelhar o que o site envia no Network).
- Headers mínimos (como no site): `Content-Type: application/json`, `x-r2f-auth: <token>`, `x-r2f-ns: null`, `Referer`/`Origin` em `https://rastreame.com.br/`.
- **`tipo`:** conforme o **de-para** acima (`OUTROS` para semanal/caução, `DOCUMENTACAO` para renegociação, `MULTA` para infração, `PEDAGIO` para pedágio/estacionamento, `ALIMENTACAO` para manutenção do cliente). Ex.: `"tipo":{"key":"OUTROS","value":"Outros","ativo":true}` no PUT completo; no POST mínimo costuma bastar `"tipo":{"key":"OUTROS"}`.
- **`rastreavel`** e **`motorista`:** usar `key` (e `value` quando o PUT exigir espelho do registo) conforme capturado no DevTools ao editar um gasto existente na UI — os `key` são identificadores internos do Rastreame.
- **`data`:** ISO 8601 como o site envia (ex.: `2026-06-20T02:59:00.000Z`). Para **23:59** no fuso acordado (ex. Recife), calcular o instante correto em UTC ou **copiar o padrão** de um gasto de teste gravado na UI e reproduzir a mesma conversão.

Detalhe de campos e exemplos de corpo: ver `reference.md` nesta pasta.

## Antes de cadastrar — verificar duplicado (obrigatório)

**Sempre**, antes de **`POST`** (novo gasto), **confirmar que já não existe** um registo com o **mesmo nome** — isto é, o mesmo texto em **`info`** (título/descrição visível na [listagem](https://rastreame.com.br/#/gastos/list)), **no mesmo contexto** quando fizer sentido:

1. Consultar a listagem (filtros por data / motorista / rastreável conforme a UI) **ou** o endpoint de listagem capturado no DevTools.
2. Comparar **`info`** com normalização mínima: `trim`, espaços consecutivos, e **ignorar diferença só entre** `ATRASADO -` vs `ATRASADO ` se for claramente o mesmo lançamento (evitar duplicar parcela).
3. Restringir a duplicidade ao **mesmo `motorista.key`** e **mesmo `rastreavel.key`** quando estiveres a lançar para esse par (dois motoristas diferentes podem ter textos semelhantes).
4. **Se já existir** um gasto com esse **`info`** (e mesmo motorista/rastreável): **não** criar outro com `POST`; em vez disso, **editar o existente** (`PUT`) se for correção de valor/data, ou **abortar** e alinhar com o operador se for erro de dados.

Isto aplica-se a: lançamentos de **segunda** (`ATRASADO - Pagamento semanal - …`), **novo registo após pagamento parcial**, **fatura da semana**, e qualquer outro `POST` ao abrigo desta skill.

> Tags `ATRASADO` / `[NEGOCIADO X]`: ver seção **"Tags no `info` — fonte única"** no topo desta skill.

## Segunda-feira — lançamentos automáticos (em atraso)

**Objetivo:** cada **segunda**, cadastrar no Rastreame os valores **a receber** naquela semana, por **cliente (motorista)** e **veículo (rastreável)**, de acordo com **contrato** e veículo (consultar pasta do contrato / `database/clientes.json` / `database/veiculos.json` e valores semanais acordados).

Para cada combinação a lançar:

| Campo | Regra |
|-------|--------|
| **Tipo** | **Outros** (`OUTROS`). |
| **Horário** | Sempre **23:59** (no fuso usado pelo operador; ver nota acima sobre `data` em ISO). |
| **Título / `info`** | Exatamente: **`ATRASADO - Pagamento semanal - {dia_semana} {dia}`** — onde `{dia_semana}` é o dia da semana em português (ex.: Segunda, Terça, …) e `{dia}` é o dia do mês (ex.: 22). **Exemplo:** `ATRASADO - Pagamento semanal - Segunda 22` |
| **`total`** | Valor da parcela semanal prevista (contrato + veículo). |

**Automatização:** agendar na máquina do operador (ex.: **Agendador de Tarefas** do Windows) um comando à segunda que invoque o agente com esta skill **ou** scripts que chamem os comandos da tool Rastreame (`rastreame-gastos post`, etc.) com JSON gerado (sempre após verificação de duplicados).

## Quando o cliente paga — edição e novos registos

### Pagamento integral (valor pago = valor total devido)

1. **Editar** o gasto existente (o que tinha `ATRASADO` no título):
   - Remover a palavra **`ATRASADO`** do texto em **`info`** (manter o restante coerente, ex. `Pagamento semanal - Sexta 19`).
   - Atualizar **`data`** (e horário) para a **data e hora reais do pagamento**.

### Pagamento parcial (valor pago < valor total)

1. **Atualizar (PUT)** o registo existente:
   - **`total`** = **saldo em atraso** (ex.: total devido R$ 800 − pago R$ 775 ⇒ **`total` 25**).
   - Manter o contexto de atraso no **`info`** conforme o caso (ex.: continuar a indicar que é o remanescente em atraso, alinhado ao texto que o site já usava para esse lançamento).
2. **Criar (POST)** um **novo** gasto (após **verificar duplicado** na secção acima — o `info` do pagamento parcial não deve já existir para esse motorista/rastreável):
   - **`total`** = **valor pago** (ex.: 775).
   - **`info`** = mesmo tipo de descrição **sem** a palavra **`ATRASADO`** (ex.: `Pagamento semanal - Sexta 19`).
   - **`data`** = **data e hora reais** do pagamento (ex.: 20/06 às 22:37 ⇒ refletir em ISO como no Network).
3. **Criar (POST)** a **próxima parcela semanal** `ATRASADO` (+7 dias), com valor cheio da semana (contrato), **sempre** — igual à baixa integral.

**Exemplo (resumo):** Susana; total devido **R$ 800** referente ao dia **19**; em **20/06 às 22:37** pagou **R$ 775** ⇒ atualizar o lançamento antigo para **R$ 25,00** em atraso; criar novo lançamento de **R$ 775** com data/hora do pagamento e **sem** `ATRASADO` no título.

## Fatura da semana

- Cadastrar também os lançamentos de **fatura da semana** conforme processo interno Lanza (valores, motorista, rastreável, datas), sempre respeitando **OUTROS** quando for o tipo acordado para estes movimentos.
- Cruzar com contrato/veículo para não duplicar parcela já quitada.
- **Antes do `POST`:** verificar na listagem se já não existe gasto com o **mesmo `info`** (nome) para o mesmo motorista/rastreável.

## Ordem sugerida para o agente

### Baixa unitária (cliente + valor + data)

1. `baixa-recebimento plano --cliente … --valor … --data … [--hora …] [--comprovante …] --json`
2. Tabela + **Sim/Não por linha** (quitação + próxima parcela).
3. `gravar-cliente-despesa editar` + push; comprovante via PUT se aplicável.

### Baixa em lote (PagBank)

1. Verificar `PAGBANK_AUTH` (pedir credenciais se faltar — tool `.cursor/tools/pagbank/`).
2. `pagbank match [--inicio …] [--fim …] --json`
3. Por cada plano em `planos[]` (**do mais recente ao mais antigo**): tabela + **Sim/Não por linha** → gravar confirmados.
4. Reportar `semMatch` para revisão manual.

### Cadastro / edição manual (legado)

1. Identificar motorista (`motorista.key`) e veículo (`rastreavel.key`) via
   `database/clientes.json`, `database/veiculos.json`, `database/cliente-despesas.json` e/ou
   `rastreame-gastos list`. Código: `src/lib/rastreame/motorista.ts`, `src/lib/rastreame/gasto.ts`.
2. Montar o **plano** (integral/parcial, quais `RAST-*` editar, quais POST criar).
3. **Antes de qualquer gravação:** verificar duplicado por **`info`** + motorista + rastreável
   (secção **Antes de cadastrar**).
4. **Pré-visualização + seletor Sim/Não por linha** — tabela com **todos** os registos a
   criar/atualizar; **confirmar cada linha** antes de gravar. **Não gravar linhas com Não.**
5. **Após Sim:** `gravar-cliente-despesa` (editar / lote) — o sync Rastreame corre **automaticamente**.
6. Se `--comprovante`, **PUT** adicional no gasto Rastreame (campo `comprovante`).
7. Rotina de **segunda:** listar quem deve parcela → passos 3–6 para cada lançamento
   `ATRASADO - Pagamento semanal - …` (não duplicar se o mesmo `info` já existir).

## Dependências

- Tool **Rastreame** (`.cursor/tools/rastreame/`) — execução dos comandos no site.
- Tool **PagBank** (`.cursor/tools/pagbank/`) — extrato de créditos (modo lote).
- CLI **`baixa-recebimento`** — `src/lib/recebimento/baixaPlano.ts` (plano de baixa).
- Rede e browser/DevTools para validar payloads se a API mudar.
- Dados locais: `database/clientes.json`, `database/veiculos.json`, pastas de contrato em `contratosDir` (`config/lanza_paths.json`).
