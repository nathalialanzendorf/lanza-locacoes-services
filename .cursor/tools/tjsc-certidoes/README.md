# Tool — TJSC: Certidão Criminal (eproc)

Emissão de **certidão criminal estadual** do Tribunal de Justiça de Santa
Catarina, pelo sistema de certidões do PJSC
([certidoes.tjsc.jus.br](https://certidoes.tjsc.jus.br/)). Abrangência **estadual
(SC)**. Usada pela skill **relatorio-analise-cadastro** como **passo assistido/manual**.

Por que assistido (não automatizado):

- Exige **login gov.br** (nível **prata** ou superior) **+ credencial externa**
  no PJSC (mesmo CPF da conta gov.br).
- A certidão **não sai na hora**: o sistema processa e envia o **link por e-mail**
  em **até 5 dias úteis**. Logo, não há resultado em tempo real para capturar.

Referência técnica: [reference.md](reference.md)

## Como a análise de cadastro usa

`src/lib/analiseCadastro/tjsc.ts` (via `src/run.ts relatorio-analise-cadastro`):

1. Abre `https://certidoes.tjsc.jus.br/` no Chrome real.
2. Orienta o operador a logar no gov.br, abrir **Certidões → Requisição**,
   escolher modelo **Criminal**, preencher **Nome** (busca fonética) e, se
   possível, o **CPF** (refina), e o e-mail de resposta.
3. Marca a fonte `tjsc` como **`assistido`** no relatório (resultado virá por
   e-mail; anexar depois).

## Notas

- A pesquisa é **fonética por nome**; informar o **CPF** ajuda a refinar e a
  filtrar homônimos.
- A certidão criminal do eproc tem **abrangência estadual** (todas as comarcas de
  SC) e cobre as classes da área criminal, incluindo Juizados Especiais Criminais.

## LGPD

Dados criminais de terceiros: a análise de cadastro só roda com **base legal**
registrada (ver skill `relatorio-analise-cadastro`). Uso restrito à finalidade de
análise de cadastro.
