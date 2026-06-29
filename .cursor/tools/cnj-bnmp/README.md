# Tool — CNJ BNMP (Banco Nacional de Medidas Penais e Prisões)

Consulta pública de **mandados de prisão / pessoas procuradas e foragidas** em
[portalbnmp.cnj.jus.br](https://portalbnmp.cnj.jus.br/). Cobertura **nacional**.
Usada pela skill **relatorio-analise-cadastro** (busca por **nome**).

- **Busca por nome:** pública, **sem login**.
- **Busca por CPF:** restrita a usuários autenticados com certificado digital
  (não disponível na consulta pública) — por isso a análise de cadastro busca por **nome** e
  depois confere CPF/nascimento manualmente (homônimos).
- **Captcha:** o portal exige passar um **captcha** antes de liberar a busca; a
  sessão (cookie `portalbnmp`) fica válida por um tempo curto. Por isso usamos
  **Chrome real** (o operador resolve o captcha uma vez) e capturamos a resposta.

Referência técnica (endpoints): [reference.md](reference.md)

## Como a análise de cadastro usa

`src/lib/analiseCadastro/bnmp.ts` (via `src/run.ts relatorio-analise-cadastro`):

1. Abre `https://portalbnmp.cnj.jus.br/#/pesquisa-peca` no Chrome real.
2. O operador **passa o captcha** e **pesquisa pelo nome** do locatário.
3. O harness CDP **captura** a resposta JSON do endpoint
   `/bnmpportal/api/pesquisa-pecas/filter` (ou `/pecas`).
4. Normaliza os resultados (peças/mandados) e marca a fonte `bnmp` no relatório.

## Limitações

- **Homônimos:** a busca por nome traz qualquer pessoa com o mesmo nome — é
  preciso conferir CPF/data de nascimento antes de concluir.
- **Sigilosos:** mandados sigilosos/restritos não aparecem na consulta pública.
- **Cobertura/migração:** mandados muito antigos podem não estar migrados.

## LGPD

Dados criminais de terceiros: a análise de cadastro só roda com **base legal**
registrada (ver skill `relatorio-analise-cadastro`). Uso restrito à finalidade de
análise de cadastro.
