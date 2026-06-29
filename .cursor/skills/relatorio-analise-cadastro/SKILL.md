---
name: relatorio-analise-cadastro
description: >-
  Relatório de análise de cadastro de locatário: consulta antecedentes criminais
  e processos em fontes públicas gratuitas (CNJ BNMP, PF SINIC, TJSC) a partir de
  CPF + nome + data de nascimento, via Chrome real (o operador resolve
  captcha/login), exigindo registro da base legal (LGPD), e gera relatório em
  relatorios/analise-cadastro/. Use quando o utilizador pedir análise de cadastro
  de locatário, triagem de locatário, antecedentes criminais, verificar
  processos, checar candidato a locação, ou consulta BNMP/PF/TJSC antes de fechar
  um contrato.
---

# Relatório de análise de cadastro — antecedentes criminais / processos

Skill de **negócio**: dado um candidato a locatário, consultar **fontes públicas
gratuitas** de antecedentes criminais e processos e gerar um **relatório
estruturado** em `relatorios/analise-cadastro/`. Não altera `database/clientes.json`.

As consultas rodam num **Chrome real** (mesmo padrão do solver DETRAN SC): o
operador resolve o **captcha/login** na janela e o harness captura o resultado.
**Sem solver pago.** Código em `src/lib/analiseCadastro/`; tools em
`.cursor/tools/{cnj-bnmp,pf-antecedentes,tjsc-certidoes}/`.

## LGPD — passo obrigatório antes de rodar

Antecedentes e processos são **dados pessoais sensíveis de terceiros**. Antes de
qualquer consulta:

1. **Confirmar a base legal** com o utilizador (tipicamente **consentimento do
   locatário**) e quem é o **titular** que consentiu.
2. Passar essa base legal em `--base-legal` (obrigatório) — sem ela, a CLI
   **recusa** rodar.
3. A base legal, o titular e a finalidade ficam **gravados no relatório** para
   auditoria. Uso **restrito à finalidade de análise de cadastro**.

## Executar

```bash
npx tsx src/run.ts relatorio-analise-cadastro \
  --cpf 123.456.789-09 \
  --nome "Fulano de Tal" \
  --nascimento 31/12/1990 \
  --base-legal "consentimento do locatário" \
  --titular "Fulano de Tal" \
  --solicitante "Operador Lanza"
```

Abre o Chrome e roda as fontes em sequência. Em cada aba o operador faz a parte
manual (captcha/preenchimento/login); o restante é automático.

| Parâmetro | Obrigatório | Conteúdo |
|---|---|---|
| `--cpf` | sim | CPF (com ou sem pontuação); validado (11 dígitos + DV) |
| `--nome` | sim | Nome civil completo |
| `--nascimento` | sim | Data de nascimento `DD/MM/AAAA` |
| `--base-legal` | **sim (LGPD)** | Base legal (ex.: consentimento do locatário) |
| `--bnmp` / `--pf` / `--tjsc` | não | Seleciona fontes (sem nenhuma → todas) |
| `--titular` | não | Quem consentiu (default: o próprio locatário) |
| `--solicitante` | não | Operador que faz a análise de cadastro |
| `--aprovar` / `--reprovar` | não | Decisão do operador: passou (`aprovado=true`) ou não (`false`); sem nenhuma → `pendente` |
| `--cliente` | não | Cliente a vincular (`id` ou `cpf`); default: o CPF da análise |
| `--sem-vinculo` | não | Não espelha o resultado no cliente (`clientes.json`) |
| `--timeout-min` | não | Minutos de espera por fonte (default 6) |
| `--sem-browser` | não | Não abre o Chrome; só relatório-esqueleto (fontes pendentes) |
| `--out` | não | Base de saída (default: `relatorios/analise-cadastro/<cpf>-<data>`) |
| `--json` | não | Imprime o relatório no stdout |

## Passo a passo por fonte

- **BNMP** (`bnmp`): na aba, **passe o captcha** e **pesquise pelo nome**; o
  resultado da busca é capturado e normalizado (mandados/peças). Confirme
  CPF/nascimento — a busca por nome traz **homônimos**.
- **PF SINIC** (`pf-sinic`): preencha CPF/nome/nascimento/filiação, **resolva o
  reCAPTCHA** e emita; o **PDF** é capturado e analisado (`NADA CONSTA` vs
  **protocolo/consta** → alerta para conferência presencial).
- **TJSC** (`tjsc`): **passo assistido** — login gov.br (prata) + credencial
  PJSC, requisitar certidão **Criminal** por nome (+CPF). A certidão vem por
  **e-mail** (até 5 dias úteis); anexar ao caso depois. Ao terminar, pressione
  **Enter** no terminal para fechar o Chrome.

## Saída

**Convenção do projeto: todo relatório gera `.txt` + `.json` e um canvas.** Por
execução, em `relatorios/analise-cadastro/<cpf>-<AAAA-MM-DD>`:

- `.txt` — documento legível (conclusão, LGPD, fontes).
- `.json` — estruturado (schema `triagem-locatario/v2`); é o **sidecar do canvas**.
- **canvas** `.canvas.tsx` — passo do agente (ver secção Canvas abaixo).

O `.json` contém:

- `locatario` — cpf, cpfFormatado, nome, nascimento.
- `lgpd` — baseLegal, titularConsentimento, solicitante, finalidade.
- `fontes[]` — por portal (`bnmp`, `pf-sinic`, `tjsc`): `status`
  (`ok`|`erro`|`assistido`|`pendente`|`pulado`), `alerta`, `observacao`,
  `achados[]`, `evidencia` (ex.: PDF da PF).
- `alertaGeral` + `resumo` — conclusão automática.

### Histórico — `database/analise-cadastro.json`

Cada execução real (não `--sem-browser`) grava um **registro de histórico** em
`database/analise-cadastro.json` (módulo `src/lib/analiseCadastro/triagemDb.ts`):

- **Chave natural:** `cpf` + `dataConsulta` (AAAA-MM-DD) — uma análise por dia
  por CPF; rodar de novo no mesmo dia **atualiza** (idempotente). Dias diferentes
  acumulam histórico.
- `clienteId` vincula a `clientes.json` quando o CPF está cadastrado.
- Guarda o **resumo por fonte** (status, alerta, observação, qtd. de achados,
  evidência) e os **caminhos** dos relatórios `.json`/`.txt` (o detalhe completo
  fica nos relatórios, não na database).
- Consulta do histórico:

```bash
npx tsx src/run.ts relatorio-analise-cadastro --listar [--cpf CPF] [--com-alerta] [--json]
```

## Vínculo ao cliente + cadastro-cliente

A análise **espelha o resultado no cliente** (`database/clientes.json`), na coluna
`analiseCadastro`: **`aprovado`** (passou? `true`/`false`/`null`=pendente) e
**`dataConsulta`** (quando foi realizada), além de `alertaGeral`, `resumo`,
`analiseId` e `relatorioTxt`.

Fluxo recomendado ao analisar um candidato:

1. Rodar a análise; **revisar** os achados (conferir homônimos por CPF/nascimento).
2. Registrar a decisão com **`--aprovar`** ou **`--reprovar`** (sem flag fica
   `pendente`). A decisão grava em `analise-cadastro.json` **e** no cliente.
3. **Se aprovado**, acionar a skill **`cadastro-cliente`** para registrar o
   locatário (CNH + comprovante). O cliente recém-criado **herda automaticamente**
   a última análise daquele CPF — mesmo que a análise tenha sido feita **antes**
   do cadastro (não é preciso re-rodar).

- **Reprovado inativa o cliente:** com `--reprovar` (ou herança de uma análise
  `aprovado=false`), o cliente é marcado **`ativo=false`** em `clientes.json`
  (inativação **local**; os syncs não empurram inativação ao Rastreame).
- Se o CPF **ainda não** está cadastrado, a CLI avisa e a herança ocorre no
  momento do `cadastro-cliente`.
- Para apontar outro cliente (ex.: CPF divergente), use `--cliente <id|cpf>`.
- Para **não** mexer no `clientes.json`, use `--sem-vinculo`.
- Mudar a decisão depois sem re-rodar: `merge-cliente editar <id|cpf> patch.json`
  com `{ "analiseCadastro": { "aprovado": true, ... } }`.

### Achados por cliente — `database/cliente-analise.json`

Toda execução real grava também, de forma **granular**, **o que foi identificado**,
**em qual site** e **quando**: uma linha por **CPF × fonte × dia** com `identificado`
(resumo), `achados[]` (detalhe), `site` (ex.: `portalbnmp.cnj.jus.br`), `status`,
`alerta`, `evidencia`, `dataConsulta` e vínculos `clienteId`/`analiseId`. Útil para
auditar o que cada portal retornou por cliente.

## Canvas (obrigatório junto ao TXT)

**Toda análise de cadastro gera dois entregáveis: o `.txt` e um canvas.** Depois de
rodar a CLI, **sempre** crie um canvas a partir do JSON sidecar
(`relatorios/analise-cadastro/<cpf>-<AAAA-MM-DD>.json`).

- **Local do arquivo:** `~/.cursor/projects/d-Dropbox-Aworklanza/canvases/analise-cadastro-{cpf}.canvas.tsx` (kebab-case; só o IDE detecta nesse diretório).
- **Dados:** leia o JSON e **embuta inline**; importe **só** de `cursor/canvas`; sem rede/imports relativos; cores via `useHostTheme()`.
- **Conteúdo:** cabeçalho (nome, CPF, nascimento, data). Cartão de destaque com a **conclusão** (verde sem alerta / vermelho com alerta) e a **decisão** (APROVADO / REPROVADO / pendente). Tabela de **fontes** (fonte/site, status, o que foi identificado, evidência) — uma linha por portal (BNMP/PF/TJSC). Bloco **LGPD** (base legal, titular, finalidade). Omita seções vazias.
- Sem slop (sem gradiente, emoji como ícone, sombra); rótulos claros.
- Ao terminar, mencione o canvas com link markdown para o caminho do `.canvas.tsx`.

## Fontes (gratuitas)

| id | Fonte | Busca | Acesso | Estado |
|---|---|---|---|---|
| `bnmp` | CNJ BNMP (`portalbnmp.cnj.jus.br`) | nome | captcha, sem login | automático (captura) |
| `pf-sinic` | PF SINIC (`servicos.pf.gov.br`) | CPF + dados | reCAPTCHA → PDF | automático (captura PDF) |
| `tjsc` | TJSC certidão criminal (`certidoes.tjsc.jus.br`) | nome + CPF | gov.br (prata) → e-mail | assistido/manual |

**Fora de escopo:** CNJ DataJud (só busca por nº de processo; dados das partes
sigilosos) e solvers pagos de captcha (usa-se Chrome real/gratuito).

## Cuidados de interpretação

- **Homônimos:** BNMP e TJSC buscam por **nome**; sempre conferir CPF/nascimento.
- **PF "protocolo":** não é prova de condenação — exige verificação presencial.
- Tratar cada fonte como **um sinal**; decidir com o conjunto + conferência.

## Skills / tools relacionadas

- **cadastro-cliente** — após aprovação da análise de cadastro, registra o locatário.
- **cadastro-contrato** — a análise de cadastro é insumo de decisão antes de gerar contrato.
- Tools dos portais: `.cursor/tools/cnj-bnmp/`, `.cursor/tools/pf-antecedentes/`,
  `.cursor/tools/tjsc-certidoes/`.
