---
name: cadastrar-veiculo
description: >-
  Registers a vehicle by reading the CRLV/vehicle document (PDF or image) and
  writes to database/veiculos.json with FIPE lookup and owner link in
  parceiro-veiculo.json. Use when the user asks to register a vehicle, CRLV,
  placa, or update veiculos.json.
---

# Cadastrar Veículo — CRLV (PDF/imagem)

Skill para **cadastrar um veículo** a partir do **CRLV** (PDF ou imagem). Destino: `database/veiculos.json` + vínculo em `database/parceiro-veiculo.json`.

## Fonte e destino

- **Arquivo:** PDF/imagem do CRLV (Read / visão). **Procurar primeiro** em `documentosRaiz` em `config/lanza_paths.json` (padrão `D:\Dropbox\Aluguel Carros`); em seguida pastas típicas de Downloads.
- **Destino:** `database/veiculos.json` (array `veiculos`). **`id`** = **uuid**; chave natural: **`placa`**. O comando `merge-veiculo` (TypeScript) define `id` ao gravar.

## Campos a extrair do CRLV

| Campo (JSON) | No documento |
|--------------|----------------|
| `placa` | `ABC-1D23` / `ABC-1234` |
| `marcaModelo` | ex.: `VW/GOL 1.0` |
| `anoModelo` | ex.: `2012/2013` |
| `chassi` | Chassi |
| `renavam` | RENAVAM |
| `cor` | Cor |
| `fipe` / `fipeCodigo` / `fipeModelo` / `fipeValor` / `fipeReferencia` | Via API (comando `fipe`). No contrato: `marcaModelo` + ` (fipeModelo)` quando preenchido. |

## Ferramentas TypeScript (`src/` na raiz do repo)

Na **raiz do repositório**, após `npm install` na raiz:

```text
npx tsx src/run.ts <subcomando> ...
```

## Fipe (API)

```bash
npx tsx src/run.ts fipe marca "peugeot"
npx tsx src/run.ts fipe modelos 44 2008 allure
npx tsx src/run.ts fipe anos 44 7201 2021
npx tsx src/run.ts fipe valor 44 7201 2021-5
```

### Atualizar FIPE em lote (`veiculos.json`)

```bash
npx tsx src/run.ts atualizar-fipe-veiculos
npx tsx src/run.ts atualizar-fipe-veiculos --placa ABC1D23
```

O script escolhe marca/modelo/ano com base em **`marcaModelo`**, **`anoModelo`** e **`fipeModelo`** (texto auxiliar). Ajustes manuais por placa ficam em **`EXTRAS_BY_PLACA`** em `src/cli/atualizarFipeVeiculos.ts`. Em caso de divergência com o veículo real, corrija o registro no JSON ou refine os extras e rode de novo.

### Sincronizar dados do CRLV (PDF nas pastas)

PDFs nomeados pela **placa sem hífen** (ex.: `MLN0B87.pdf`) em qualquer subpasta de **`documentosRaiz`** (`config/lanza_paths.json`, ex.: `D:\Dropbox\Aluguel Carros\Ana - FORD FIESTA 2013-2014\`) ou em `veiculos/` na raiz do repo são lidos e os campos **`marcaModelo`**, **`anoModelo`**, **`chassi`**, **`renavam`** e **`cor`** em `database/veiculos.json` são atualizados quando o texto do PDF bate com os rótulos do CRLV.

Dependência: `npm install` na raiz do repositório (pacote **`pdf-parse`**).

```bash
npx tsx src/run.ts sincronizar-veiculos-crlv --dry-run
npx tsx src/run.ts sincronizar-veiculos-crlv
npx tsx src/run.ts sincronizar-veiculos-crlv --placa MLN-0B87
```

CRLV **escaneado** (imagem) pode não ter texto extraível; nesse caso use OCR ou mantenha o cadastro manual. Depois de alterar marca/ano, rode `atualizar-fipe-veiculos` se quiser alinhar `fipe` / `fipeCodigo` / etc.

## Proprietário

Perguntar: parceiro existente (`database/parceiros.json`, **`id`** uuid) ou nome novo (gera `id` uuid automaticamente).

## Gravar

Montar objeto `veiculo` (sem `id`) + nome do proprietário em JSON temporário, depois:

```bash
npx tsx src/run.ts merge-veiculo caminho/veiculo_tmp.json "Nome do Proprietario"
```

O script deduplica por **placa**, atualiza `parceiros.json` se necessário e recria o vínculo em `parceiro-veiculo.json`. **Em veículo novo** (`cadastrado`, não atualização por placa), após gravar, chama automaticamente a sincronização FIPE (`atualizar-fipe-veiculos --placa …`) no mesmo processo para preencher/atualizar `fipe`, `fipeCodigo`, `fipeModelo`, `fipeValor` e `fipeReferencia`. Se a API falhar, aparece aviso no console; corrija dados ou `EXTRAS_BY_PLACA` e rode `atualizar-fipe-veiculos` manualmente.

## Critério de conclusão

- CRLV extraído; consulta FIPE (comando `fipe` ou campos preenchidos antes do merge); proprietário coletado; confirmação antes de gravar.
- Sem duplicar placa.
- **Veículo novo:** após `merge-veiculo`, campos FIPE no JSON alinhados à API (automático no mesmo fluxo, ou correção manual se houver aviso).

## Skills relacionadas

- **cadastrar-cliente**, **gerar-contrato**
