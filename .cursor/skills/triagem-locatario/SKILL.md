---
name: triagem-locatario
description: >-
  Triagem de locatário: consulta antecedentes criminais e processos em fontes
  públicas gratuitas (CNJ BNMP, PF SINIC, TJSC) a partir de CPF + nome + data de
  nascimento, via Chrome real (o operador resolve captcha/login), exigindo
  registro da base legal (LGPD), e gera relatório em relatorios/triagem/. Use
  quando o utilizador pedir triagem de locatário, antecedentes criminais,
  verificar processos, checar candidato a locação, ou consulta BNMP/PF/TJSC
  antes de fechar um contrato.
---

# Triagem de locatário — antecedentes criminais / processos

Skill de **negócio**: dado um candidato a locatário, consultar **fontes públicas
gratuitas** de antecedentes criminais e processos e gerar um **relatório
estruturado** em `relatorios/triagem/`. Não altera `database/clientes.json`.

As consultas rodam num **Chrome real** (mesmo padrão do solver DETRAN SC): o
operador resolve o **captcha/login** na janela e o harness captura o resultado.
**Sem solver pago.** Código em `src/lib/triagem/`; tools em
`.cursor/tools/{cnj-bnmp,pf-antecedentes,tjsc-certidoes}/`.

## LGPD — passo obrigatório antes de rodar

Antecedentes e processos são **dados pessoais sensíveis de terceiros**. Antes de
qualquer consulta:

1. **Confirmar a base legal** com o utilizador (tipicamente **consentimento do
   locatário**) e quem é o **titular** que consentiu.
2. Passar essa base legal em `--base-legal` (obrigatório) — sem ela, a CLI
   **recusa** rodar.
3. A base legal, o titular e a finalidade ficam **gravados no relatório** para
   auditoria. Uso **restrito à finalidade de triagem**.

## Executar

```bash
npx tsx src/run.ts triagem-locatario \
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
| `--solicitante` | não | Operador que faz a triagem |
| `--timeout-min` | não | Minutos de espera por fonte (default 6) |
| `--sem-browser` | não | Não abre o Chrome; só relatório-esqueleto (fontes pendentes) |
| `--out` | não | Base de saída (default: `relatorios/triagem/<cpf>-<data>`) |
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

Dois artefatos por execução em `relatorios/triagem/<cpf>-<AAAA-MM-DD>.json`
(schema `triagem-locatario/v2`) e `.md` (resumo legível):

- `locatario` — cpf, cpfFormatado, nome, nascimento.
- `lgpd` — baseLegal, titularConsentimento, solicitante, finalidade.
- `fontes[]` — por portal (`bnmp`, `pf-sinic`, `tjsc`): `status`
  (`ok`|`erro`|`assistido`|`pendente`|`pulado`), `alerta`, `observacao`,
  `achados[]`, `evidencia` (ex.: PDF da PF).
- `alertaGeral` + `resumo` — conclusão automática.

### Histórico — `database/triagem.json`

Cada execução real (não `--sem-browser`) grava um **registro de histórico** em
`database/triagem.json` (módulo `src/lib/triagem/triagemDb.ts`):

- **Chave natural:** `cpf` + `dataConsulta` (AAAA-MM-DD) — uma triagem por dia
  por CPF; rodar de novo no mesmo dia **atualiza** (idempotente). Dias diferentes
  acumulam histórico.
- `clienteId` vincula a `clientes.json` quando o CPF está cadastrado.
- Guarda o **resumo por fonte** (status, alerta, observação, qtd. de achados,
  evidência) e os **caminhos** dos relatórios `.json`/`.md` (o detalhe completo
  fica nos relatórios, não na database).
- Consulta do histórico:

```bash
npx tsx src/run.ts triagem-locatario --listar [--cpf CPF] [--com-alerta] [--json]
```

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

- **cadastro-cliente** — após aprovação da triagem, registra o locatário.
- **cadastro-contrato** — a triagem é insumo de decisão antes de gerar contrato.
- Tools dos portais: `.cursor/tools/cnj-bnmp/`, `.cursor/tools/pf-antecedentes/`,
  `.cursor/tools/tjsc-certidoes/`.
