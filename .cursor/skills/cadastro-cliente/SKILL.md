---
name: cadastro-cliente
description: >-
  CRUD of rental clients (driver/lessee): create, edit, delete in database/clientes.json
  from CNH and address proof. Use when the user asks to register, edit, or remove a
  client, CNH, motorista, or clientes.json.
---

# Cadastro de cliente — CNH (PDF/imagem)

Skill para **cadastrar, editar e excluir** clientes (motoristas/locatários) em `database/clientes.json`, mantendo o espelho no Rastreame (motorista).

## Regra de dados (Rastreame × database)

- O **Rastreame** guarda **campos nativos** do motorista: `nome`, `cpf`, `cnh` (número), `categoriaCnh`, `vencimentoCnh`, `contato` (celular/e-mail).
- Campos da CNH **sem campo nativo** no Rastreame vão para **`observacao`** (texto multilinha com secções **CNH** e **ENDEREÇO**), tanto no `rastreame add` quanto no `sync-motoristas` (push).
- **Endereço** (comprovante) também vai para **`observacao`**, na secção ENDEREÇO — além de permanecer em `clientes.json`.
- Metadados internos (`analiseCadastro`, `id`, etc.) **só existem na database** — não vão para o Rastreame.
- No **pull** (`sync-motoristas --pull-only`), `observacao` **não é lida** — a database local continua fonte da verdade dos dados extras.

### Formato de `observacao` no Rastreame

```
------------------------------------------------------------
CNH
------------------------------------------------------------
DD/MM/AAAA, Cidade, UF
DD/MM/AAAA                    ← emissão CNH (cnh.dataEmissao)
Nº RG Órgão UF                ← ex.: 1051879193 SSP RS
000.000.000-00                ← CPF
Brasileiro(a)                 ← nacionalidade (padrão se ausente)
Pai / Mãe                     ← filiação (" e " → " / ")
------------------------------------------------------------
ENDEREÇO
------------------------------------------------------------
Logradouro, S/N, Bairro, Cidade, Estado, CEP.
```

Linhas adicionais na secção CNH (quando preenchidas e couber no limite): `1ª habilitação: …`, `Espelho: …`, `Emissor: DETRAN/UF`, `EAR: Sim|Não`, `Obs CNH: …`.

> **Limite Rastreame:** `observacao` aceita no máximo **500 caracteres**. Se exceder, linhas extras da CNH são omitidas; em último caso o texto é truncado. Campos de endereço com lixo de contrato colado por engano são sanitizados antes do envio.

Exemplo completo:

```
------------------------------------------------------------
CNH
------------------------------------------------------------
03/03/1974, Porto Alegre, RS
24/02/2025
1051879193 SSP RS
654.003.800-34
Brasileiro(a)
Jadir Albeche Pereira / Vera Beatriz Gonzaga
------------------------------------------------------------
ENDEREÇO
------------------------------------------------------------
Rua Manoel Cruz, S/N, Centro, Jaguaruna, Santa Catarina, 88715-000.
```

## Análise de cadastro (coluna `analiseCadastro`)

- Antes de fechar locação, faça a **análise de cadastro** (skill **`relatorio-analise-cadastro`**) do candidato. **Recomendado: análise → decisão → cadastro.**
- O cliente tem a coluna **`analiseCadastro`** em `clientes.json`: **`aprovado`** (passou? `true`/`false`/`null`=pendente) e **`dataConsulta`** (quando foi feita), além de `alertaGeral`, `resumo`, `analiseId` e `relatorioTxt`.
- **Herança automática:** ao cadastrar (via `merge-cliente`/importação), se já existir uma análise para o **CPF**, o cliente **herda** a última automaticamente — mesmo que a análise tenha sido feita antes do cadastro. Não é preciso re-rodar.
- **Reprovado nasce inativo:** se a análise herdada/aplicada estiver com `aprovado=false`, o cliente fica **`ativo=false`** (inativação local; o sync não empurra ao Rastreame).
- **Achados detalhados:** `database/cliente-analise.json` guarda, por **CPF × site × dia**, o que foi identificado em cada portal (BNMP/PF/TJSC). É só leitura/auditoria — preenchido pela skill da análise.
- Para registrar/mudar a decisão depois: `merge-cliente editar <id|cpf> patch.json` com `{ "analiseCadastro": { "aprovado": true, ... } }`, ou re-rodar a análise com `--aprovar`/`--reprovar`.

## Operações

| Operação | Como |
|----------|------|
| **Cadastrar** | Confirmar arquivos → ler → criar no Rastreame (nativo + observação) → sincronizar → enriquecer database |
| **Editar** | Novo JSON parcial → `merge-cliente` (mesmo CPF); **sync-cliente** replica campos nativos + `observacao` |
| **Excluir** | Remover entrada do array `clientes` em `clientes.json` (confirmar com operador) |

## Fonte de dados

- **CNH:** dados pessoais + CNH.
- **Comprovante:** CEP, logradouro, número, complemento, bairro, cidade, UF. Telefone e e-mail: do comprovante se houver; senão **perguntar**.
- **Destino:** `database/clientes.json` (array `clientes`). Schema em `schemaCliente` no próprio arquivo. **`id`** = **uuid** (gerado pelo merge TypeScript); chave natural: **`cpf`**.

## Campos a extrair da CNH

| Campo | Destino no Rastreame | Observação |
|-------|----------------------|------------|
| `nome` | ✅ nativo | Nome completo |
| `cpf` | ✅ nativo + `observacao` | CPF (`000.000.000-00`) |
| `cnh.numeroRegistro` | ✅ nativo (`cnh`) | 11 dígitos |
| `cnh.categoria` | ✅ nativo (`categoriaCnh`) | A, B, AB, C, D, E... |
| `cnh.validade` | ✅ nativo (`vencimentoCnh`) | DD/MM/AAAA |
| `rg` / `rgOrgaoExpedidor` | ✅ `observacao` | Doc. de identidade e órgão/UF |
| `dataNascimento` / `localNascimento` | ✅ `observacao` | DD/MM/AAAA + local |
| `filiacao` | ✅ `observacao` | Filiação (mãe/pai) |
| `cnh.dataEmissao` | ✅ `observacao` | DD/MM/AAAA |
| `cnh.primeiraHabilitacao` | ✅ `observacao` (linha extra) | DD/MM/AAAA |
| `cnh.numeroEspelho` | ✅ `observacao` (linha extra) | Nº espelho / segurança |
| `cnh.orgaoEmissor` / `cnh.ufEmissor` | ✅ `observacao` (linha extra) | DETRAN / UF |
| `cnh.ear` | ✅ `observacao` (linha extra) | true/false |
| `cnh.observacoes` | ✅ `observacao` (linha extra) | Observações da CNH |
| `nacionalidade` | ✅ `observacao` (secção CNH) | Padrão `Brasileiro(a)` se ausente |
| `endereco.*` | ✅ `observacao` (secção ENDEREÇO) | Também permanece em `clientes.json` |

> Endereço vem do **comprovante** e é espelhado na secção ENDEREÇO de `observacao`.

## Campos do comprovante (boleto)

| Campo (JSON) | No boleto | Destino |
|--------------|-----------|---------|
| `endereco.cep` | `00000-000` | database + `observacao` (ENDEREÇO) |
| `endereco.logradouro` | Rua/Avenida | database + `observacao` (ENDEREÇO) |
| `endereco.numero` | Número (ou S/N) | database + `observacao` (ENDEREÇO) |
| `endereco.complemento` | Casa/Apto/Bloco | database + `observacao` (ENDEREÇO) |
| `endereco.bairro` | Bairro | database + `observacao` (ENDEREÇO) |
| `endereco.cidade` | Cidade | database + `observacao` (ENDEREÇO) |
| `endereco.uf` | UF → nome do estado | database + `observacao` (ENDEREÇO) |
| `telefone` / `email` | — | ✅ `contato` nativo no Rastreame |

> Conferir o **titular** do comprovante. Se for terceiro, confirmar com o operador.

1. **PRIMEIRA AÇÃO — confirmar os arquivos.** Antes de qualquer leitura, **confirmar a localização da CNH e do comprovante de residência**. Procurar em `documentosRaiz` do `config/lanza_paths.json` (padrão `D:\Dropbox\Aluguel Carros` e subpastas) e em `%USERPROFILE%\Downloads\`; **sempre validar com `Test-Path`/listagem** e confirmar com o operador. Sem os dois documentos, perguntar antes de prosseguir.
2. **Ler e extrair** — CNH: dados pessoais + CNH. Comprovante: endereço (+ telefone/e-mail se houver). Campo ilegível → `null` + aviso.
3. **Confirmar** — resumo completo com o operador antes de gravar.
4. **Criar no Rastreame** — montar `cliente_tmp.json` com **todos** os campos extraídos; `rastreame add` envia campos nativos **e** monta `observacao` automaticamente:

```bash
npx tsx src/run.ts rastreame check "<cnh>" "<nome>"   # evitar duplicado
npx tsx src/run.ts rastreame add caminho/cliente_tmp.json
```

5. **Sincronizar com a database** — importa o motorista recém-criado e cria o registro local com os campos nativos, estabelecendo o vínculo `rastreameMotoristaKey`:

```bash
npx tsx src/run.ts sync-motoristas --pull-only
```

6. **Gravar na database** — `merge-cliente` com o mesmo `cliente_tmp.json` (inclui endereço); casa por CPF e não duplica. Se o endereço for incluído só depois, rodar **`sync-motoristas --push-only`** para atualizar a secção ENDEREÇO no Rastreame.

```bash
npx tsx src/run.ts merge-cliente caminho/cliente_tmp.json
```

7. **Resultado** — informar nome, CPF, `id` local, `rastreameMotoristaKey` e status.

**Importação em lote (CNH nas pastas de contrato):**

```bash
npx tsx src/run.ts importar-clientes-cnh --dry-run
npx tsx src/run.ts importar-clientes-cnh
npx tsx src/run.ts importar-clientes-cnh --com-rastreame   # enriquece CNH via API Rastreame
```

Varre `documentosRaiz` (`D:\Dropbox\Aluguel Carros`), pastas `DD.MM.AAAA - Nome`, arquivos `CNH*` (pdf/jpg/png…). Nome/CPF/endereço vêm do `Contrato*.docx` na mesma pasta.

## Idempotência

- **Chave:** `cpf` (preferencial), depois CNH, depois `rastreameMotoristaKey`, e por fim **nome normalizado** (evita duplicar quem já existe sem CPF/CNH casado).
- `merge-cliente` com mesmo CPF **atualiza**; não duplica.
- `rastreame add` verifica duplicado (CNH/nome) antes de criar; se já existir, faz **PUT** com dados atualizados (incluindo `observacao`).
- Ver [`_idempotencia.md`](../_idempotencia.md).

## Critério de conclusão

- Arquivos confirmados antes da leitura; campos legíveis extraídos; confirmação antes de gravar.
- Motorista no Rastreame com campos nativos **e** `observacao` preenchida conforme formato acima.
- `database/clientes.json` atualizado (com todos os campos, incluindo endereço), vinculado por `rastreameMotoristaKey`, sem duplicar CPF.

## Skills relacionadas

- Skill **relatorio-analise-cadastro** — análise de cadastro (antecedentes/processos) do candidato; preenche a coluna `analiseCadastro` (o cliente a herda no cadastro).
- Skill **sync-cliente** — sincroniza Rastreame ↔ `clientes.json` (push envia nativos + `observacao`; pull só nativos).
- Tool **Rastreame** (`.cursor/tools/rastreame/`) — comandos no site (motorista, gastos).
- Skill **cadastro-veiculo** — CRLV → `veiculos.json`.
- Skill **cadastro-contrato** — exige cliente e veículo cadastrados (ou cadastra no fluxo).
