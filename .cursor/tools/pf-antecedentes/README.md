# Tool — Polícia Federal: Certidão de Antecedentes Criminais (SINIC)

Emissão pública da **Certidão de Antecedentes Criminais (CAC)** em
[servicos.pf.gov.br/epol-sinic-publico](https://servicos.pf.gov.br/epol-sinic-publico/).
Consulta o **SINIC** (Sistema Nacional de Informações Criminais), de **cobertura
nacional** (Justiças Federal, Estadual, Eleitoral e Militar, Polícia Federal,
Polícias Civis e Penais). É a fonte mais abrangente de antecedentes criminais.
Usada pela skill **relatorio-analise-cadastro** (busca por **CPF + dados pessoais**).

- **Gratuita**, pela internet, validade de **90 dias**.
- **Captcha:** reCAPTCHA. Por isso usamos **Chrome real** (o operador resolve).
- **Resultado:** **PDF** baixado. Retorna **"NADA CONSTA"** quando não há decisão
  condenatória transitada em julgado. **Não** emite "consta" online: havendo
  registro/homônimo, gera um **número de protocolo** para atendimento presencial.

Referência técnica: [reference.md](reference.md)

## Como a análise de cadastro usa

`src/lib/analiseCadastro/pfSinic.ts` (via `src/run.ts relatorio-analise-cadastro`):

1. Abre a página de emissão da CAC no Chrome real.
2. O operador **preenche os dados** (CPF, nome, nascimento, filiação) e
   **resolve o reCAPTCHA**, e clica em emitir.
3. O harness CDP **captura o PDF** baixado, salva como evidência em
   `relatorios/_tmp/analise-cadastro/downloads/` e faz **parse** do texto.
4. Classifica o resultado: **NADA CONSTA** (sem alerta) vs **protocolo/consta**
   (alerta — exige verificação presencial por causa de homônimos).

## Importante (interpretação)

- Por lei (Lei 12.037/2009, art. 6º), o atestado só considera, para fins civis,
  **condenações com trânsito em julgado**. Um "protocolo" **não** significa
  culpa — pode ser homônimo ou divergência cadastral; **confirmar presencialmente**.
- O documento é em português e vale 90 dias.

## LGPD

Dados criminais de terceiros: a análise de cadastro só roda com **base legal**
registrada (ver skill `relatorio-analise-cadastro`). Uso restrito à finalidade de
análise de cadastro.
