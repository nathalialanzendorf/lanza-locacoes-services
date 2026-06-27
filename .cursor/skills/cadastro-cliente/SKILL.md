---
name: cadastro-cliente
description: >-
  CRUD of rental clients (driver/lessee): create, edit, delete in database/clientes.json
  from CNH and address proof. Use when the user asks to register, edit, or remove a
  client, CNH, motorista, or clientes.json.
---

# Cadastro de cliente — CNH (PDF/imagem)

Skill para **cadastrar, editar e excluir** clientes (motoristas/locatários) em `database/clientes.json`.

## Operações

| Operação | Como |
|----------|------|
| **Cadastrar** | CNH + comprovante → `merge-cliente` |
| **Editar** | Novo JSON parcial → `merge-cliente` (mesmo CPF) |
| **Excluir** | Remover entrada do array `clientes` em `clientes.json` (confirmar com operador) |

## Uso

- O usuário anexa ou informa caminhos da **CNH** e do **comprovante** (PDF/JPG/PNG).
- **Procurar primeiro** em `documentosRaiz` definido em `config/lanza_paths.json` (padrão: `D:\Dropbox\Aluguel Carros` e subpastas). Depois `%USERPROFILE%\Downloads\` (ex.: `CNH-e.pdf`, `residencia.jpg`) — **sempre confirmar** com `Test-Path` / listagem antes de assumir.

**Integração Rastreame (site):** após gravar em `database/`, a **execução** na shell (check/add motorista) segue a **tool** `.cursor/tools/rastreame/` (auth e comandos).

## Fonte de dados

- **CNH:** dados pessoais + CNH.
- **Comprovante:** CEP, logradouro, número, complemento, bairro, cidade, UF. Telefone e e-mail: do comprovante se houver; senão **perguntar**.
- **Destino:** `database/clientes.json` (array `clientes`). Schema em `schemaCliente` no próprio arquivo. **`id`** = **uuid** (gerado pelo merge TypeScript); chave natural: **`cpf`**.

## Campos a extrair da CNH

| Campo | Observação |
|-------|-----------|
| `nome` | Nome completo |
| `cpf` | CPF (`000.000.000-00`) |
| `rg` / `rgOrgaoExpedidor` | Doc. de identidade e órgão/UF |
| `dataNascimento` | DD/MM/AAAA |
| `cnh.numeroRegistro` | 11 dígitos |
| `cnh.categoria` | A, B, AB, C, D, E... |
| `cnh.primeiraHabilitacao` / `dataEmissao` / `validade` | DD/MM/AAAA |
| `cnh.numeroEspelho` | Nº espelho / segurança |
| `cnh.orgaoEmissor` / `cnh.ufEmissor` | DETRAN / UF |
| `cnh.ear` | true/false |
| `cnh.observacoes` | Observações |

> Endereço **não** vem da CNH; vem do comprovante (etapa 3).

## Campos do comprovante (boleto)

| Campo (JSON) | No boleto |
|--------------|-----------|
| `endereco.cep` | `00000-000` |
| `endereco.logradouro` | Rua/Avenida |
| `endereco.numero` | Número |
| `endereco.complemento` | Casa/Apto/Bloco |
| `endereco.bairro` | Bairro |
| `endereco.cidade` | Cidade |
| `endereco.uf` | UF |

> Conferir o **titular** do comprovante. Se for terceiro, confirmar com o usuário.

## Workflow

1. **Arquivos** — Obter caminhos da CNH e do comprovante (Read). Sem comprovante: seguir e perguntar endereço depois.
2. **CNH** — Extrair campos; ilegível → `null` + aviso.
3. **Comprovante** — Extrair endereço do titular.
4. **Confirmar** — Resumo completo antes de gravar.
5. **Gravar** — Montar objeto `cliente` (sem `id`), salvar JSON temporário e executar o merge por CPF:

```bash
npx tsx src/run.ts merge-cliente caminho/do/cliente_tmp.json
```

O script gera `id` (UUID), atualiza se CPF já existir e define `atualizadoEm`.

6. **Rastreame** (opcional, após gravar) — Seguir `.cursor/tools/rastreame/` (tabela *cadastro-cliente*): `rastreame check` e, se aplicável, `rastreame add` com o JSON do cliente.

**Importação em lote (CNH nas pastas de contrato):**

```bash
npx tsx src/run.ts importar-clientes-cnh --dry-run
npx tsx src/run.ts importar-clientes-cnh
npx tsx src/run.ts importar-clientes-cnh --com-rastreame   # enriquece CNH via API Rastreame
```

Varre `documentosRaiz` (`D:\Dropbox\Aluguel Carros`), pastas `DD.MM.AAAA - Nome`, arquivos `CNH*` (pdf/jpg/png…). Nome/CPF/endereço vêm do `Contrato*.docx` na mesma pasta (CNH-e em PDF costuma ser só imagem).

7. **Resultado** — Informar nome, CPF, `id` local e status no rastreame.

## Critério de conclusão

- Campos legíveis extraídos; confirmação antes de gravar.
- `database/clientes.json` atualizado sem duplicar CPF.

## Skills relacionadas

- Tool **Rastreame** (`.cursor/tools/rastreame/`) — comandos no site (motorista, gastos).
- Skill **cadastro-veiculo** — CRLV → `veiculos.json`.
- Skill **cadastro-contrato** — exige cliente e veículo cadastrados (ou cadastra no fluxo).
