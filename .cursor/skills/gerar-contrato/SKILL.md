---
name: gerar-contrato
description: >-
  Generates the Lanza vehicle rental contract as Word (.docx) and PDF in a dated
  folder under contratosDir. Loads client and vehicle from database/clientes.json
  and database/veiculos.json; if missing, runs cadastrar-cliente or
  cadastrar-veiculo first. Use when the user asks for contrato, locação, gerar
  contrato, PDF do contrato, CNH, or novo contrato de locação.
---

# Gerar Contrato de Locação de Veículo

Skill **única** para contratos Lanza. Substitui o fluxo antigo `contrato` (preenchimento manual só do LOCATÁRIO).

Gera **Contrato de Locação** a partir de `templates/Contrato - Modelo v3.docx`, atualizando **cliente**, **veículo**, **valores** e **prazo**. O modelo lista vários veículos na cláusula 1.1; o contrato gerado mantém **somente** o veículo escolhido. Na 1.1, o trecho **marca/modelo** é `marcaModelo` e, se existir `fipeModelo` em `database/veiculos.json`, acrescenta-se ` (fipeModelo)` entre parênteses.

## Fluxo do agente (database-first)

1. **Identificar** placa do veículo e cliente (nome ou CPF).
2. **Buscar** em `database/veiculos.json` (chave `placa`) e `database/clientes.json` (chave `cpf` ou busca por nome).
3. **Se não existir:**
   - Veículo → skill **cadastrar-veiculo** (CRLV; procurar em `documentosRaiz` em `config/lanza_paths.json`, depois Downloads).
   - Cliente → skill **cadastrar-cliente** (CNH + comprovante; mesma ordem de pastas).
4. **Perguntar só o comercial** (não reextrair CNH/CRLV se já estão no database):
   - Período, valor semanal, caução, data de início, dia de pagamento semanal.
5. **Montar** `relatorios/_dados_contrato_tmp.json` **ou** chamar a CLI em modo database (passos 4–6 abaixo).
6. **Executar** (modo database — preferido):

```bash
npx tsx src/run.ts gerar-contrato --placa PLACA --cpf CPF --semana VALOR --caucao VALOR [opções]
```

7. Confirmar pasta criada em `contratosDir` (`DD.MM.AAAA - Nome Cliente/` com `.docx`, `.pdf`, `CNH.pdf`).

## Perguntas comerciais (ordem)

1. **Veículo** — placa (deve existir em `veiculos.json` após passo 3).
2. **Cliente** — nome ou CPF (deve existir em `clientes.json` após passo 3).
3. **Período:** diária, 1 semana, 15 dias, 3 meses (padrão), 6 meses, 1 ano.
4. **Valor semanal** (R$).
5. **Caução** (R$).
6. **Data de início** (padrão: hoje), hora `18:00`.
7. **Dia de pagamento semanal** (cláusula 3.2): frase completa, ex. `todos os sábados`, `todas as segundas-feiras`.
8. **CNH em disco** — caminho para copiar como `CNH.pdf` na pasta do contrato (`cnhArquivo` no JSON). Procurar em `D:\Dropbox\Aluguel Carros` ou pedir ao operador.

### Período → dias

| Período | Dias |
|---------|------|
| diária | 1 |
| 1 semana | 7 |
| 15 dias | 15 |
| 3 meses (padrão) | 90 |
| 6 meses | 180 |
| 1 ano | 365 |

## Mapeamento database → `dados.json`

A partir de um registro em `clientes.json`:

```json
"cliente": {
  "nome": "<cliente.nome>",
  "cpf": "<cliente.cpf>",
  "endereco": {
    "logradouro": "<cliente.endereco.logradouro>",
    "numero": "<cliente.endereco.numero>",
    "complemento": "<cliente.endereco.complemento ou \"\">",
    "bairro": "<cliente.endereco.bairro>",
    "cidade": "<cliente.endereco.cidade>",
    "uf": "<cliente.endereco.uf>",
    "cep": "<cliente.endereco.cep>"
  }
},
"cnhCategoria": "<cliente.cnh.categoria>"
```

A partir de um registro em `veiculos.json`:

```json
"veiculo": {
  "placa": "<veiculo.placa>",
  "marcaModelo": "<veiculo.marcaModelo>",
  "fipeModelo": "<veiculo.fipeModelo ou omitir>",
  "chassi": "<veiculo.chassi>",
  "renavam": "<veiculo.renavam>",
  "anoModelo": "<veiculo.anoModelo>",
  "cor": "<veiculo.cor>",
  "fipe": "<veiculo.fipe ou fipeValor>"
}
```

Se endereço ou CNH estiver incompleto no database, **voltar** a **cadastrar-cliente** (atualizar registro) antes de gerar.

## Gerar (CLI)

### Modo database (recomendado)

Na raiz do repo, após `npm install`:

```bash
npx tsx src/run.ts gerar-contrato --placa QJB-0I83 --cpf 654.003.800-34 \
  --semana 650 --caucao 1500 --periodo "3 meses" \
  --cnh-arquivo "D:/Dropbox/Aluguel Carros/CNH Cliente.pdf"
```

| Flag | Obrigatório | Descrição |
|------|-------------|-----------|
| `--placa` | sim | Placa em `veiculos.json` |
| `--cpf` ou `--cliente` | sim | Locatário em `clientes.json` |
| `--semana` | sim | Valor semanal (R$) |
| `--caucao` | sim | Caução (R$) |
| `--periodo` | não | `diaria`, `1 semana`, `15 dias`, `3 meses` (padrão), `6 meses`, `1 ano` |
| `--dias` | não | Sobrescreve `--periodo` |
| `--inicio` | não | `DD/MM/AAAA` (padrão: hoje) |
| `--dia-pagamento` | não | ex. `todos os sábados` |
| `--cnh-arquivo` | não | Copia como `CNH.pdf` na pasta do contrato |
| `--dry-run` | não | Mostra JSON montado sem gerar arquivo |
| `--out arquivo.json` | não | Grava JSON montado |

Se placa ou cliente **não existirem** no database, a CLI falha com mensagem orientando **cadastrar-veiculo** / **cadastrar-cliente**.

### Modo JSON (legado / avançado)

Montar `relatorios/_dados_contrato_tmp.json` manualmente ou com `--out`:

```bash
npx tsx src/run.ts gerar-contrato "relatorios/_dados_contrato_tmp.json"
```

Exemplo completo de `dados.json` (use caminhos absolutos). Se **omitir** `contratosDir`, o script usa `config/lanza_paths.json` (`D:\Dropbox\Aluguel Carros` por defeito):

```json
{
  "template": "templates/Contrato - Modelo v3.docx",
  "contratosDir": "D:/Dropbox/Aluguel Carros",
  "cnhArquivo": "D:/Dropbox/Aluguel Carros/CNH Cliente.pdf",
  "diaPagamento": "todos os sábados",
  "cliente": { "nome": "...", "cpf": "...",
    "endereco": {"logradouro":"...","numero":"...","complemento":"","bairro":"...","cidade":"...","uf":"SC","cep":"..."} },
  "veiculo": { "placa":"...","marcaModelo":"...","fipeModelo":"...","chassi":"...","renavam":"...","anoModelo":"...","cor":"...","fipe":"..." },
  "prazo":   { "dias": 90, "inicio": "19/06/2026", "hora": "18:00" },
  "valores": { "semana": 650, "caucao": 1500, "diaria": 120 },
  "cnhCategoria": "B",
  "assinatura": { "cidade": "Tubarão", "estado": "Santa Catarina", "data": "auto" }
}
```

O script cria `DD.MM.AAAA - Nome Cliente/` com `.docx`, `.pdf` (Word via COM no Windows) e cópia da CNH se `cnhArquivo` existir.

## Dependências

Node.js; `pizzip`, `@xmldom/xmldom`. PDF: **Word instalado** no Windows.

## Skills relacionadas

- **cadastrar-cliente** — onboarding ou atualização de locatário antes de gerar.
- **cadastrar-veiculo** — onboarding de veículo antes de gerar.
- **encerrar-contrato** — fechamento após vigência ou devolução antecipada.

## Privacidade

CNH, CPF e endereço são dados sensíveis. Não commitar em repositório público.
