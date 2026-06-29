# Referência técnica — PF SINIC (Certidão de Antecedentes Criminais)

App público: `https://servicos.pf.gov.br/epol-sinic-publico/`
(emitir: `.../emitir-cac` · validar: `.../validar-cac`)

## Fluxo

1. SPA de emissão da CAC. O usuário marca "não sou robô" (**reCAPTCHA**) e
   preenche dados pessoais (CPF, nome, data de nascimento, filiação).
2. Ao confirmar, o backend consulta o **SINIC** (gerido pelo INI/DPF).
3. Saída:
   - **NADA CONSTA** → PDF da certidão é **baixado automaticamente**.
   - Registro/homônimo/divergência de CPF na Receita → **número de protocolo**
     (a certidão "consta" só é liberada presencialmente, em até 15 dias).

## Captcha

- **reCAPTCHA** (marcação manual "não sou robô"). Na triagem **não** usamos
  solver pago: o operador resolve no **Chrome real**. (Caso futuramente se queira
  automação desatendida, o padrão de solver existe em
  `src/lib/pedagioDigital/captcha.ts` — reCAPTCHA v2 via CapSolver/2Captcha.)

## Captura do resultado (triagem)

Como o resultado é um **PDF** (e não JSON), a triagem **não** chama endpoint:

1. `Browser.setDownloadBehavior` aponta os downloads para
   `relatorios/_tmp/analise-cadastro/downloads/` (feito pelo harness `browser.ts`).
2. Após o operador emitir, o harness aguarda o **download concluído**
   (`Browser.downloadWillBegin` / `downloadProgress state=completed`).
3. `src/lib/analiseCadastro/pfSinic.ts` lê o PDF e faz **parse** com `pdf-parse`,
   classificando o texto:
   - `NADA CONSTA` → sem alerta.
   - presença de "protocolo" / "consta" / "compareça" → alerta (verificação
     presencial; possível homônimo).

## Reconhecimento (DevTools)

Para mapear o endpoint/sitekey reais (opcional, caso se queira automatizar):

1. Abrir `.../epol-sinic-publico/` → F12 → aba **Network**.
2. Marcar reCAPTCHA, preencher e emitir.
3. Inspecionar a chamada de emissão (POST) e a resposta (PDF/`application/pdf`
   ou JSON com link/base64). Anotar o **sitekey** do reCAPTCHA (atributo
   `data-sitekey` ou na URL do iframe `recaptcha`).

## Observações

- O nome é o vetor de homônimos: a PF não emite "consta" online justamente por
  isso. Tratar protocolo como **sinal**, nunca prova.
- A certidão vale **90 dias** — guardar o PDF como evidência datada.
