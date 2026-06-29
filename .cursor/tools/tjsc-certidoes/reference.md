# Referência técnica — TJSC Certidões (eproc)

Portais:
- Sistema de certidões: `https://certidoes.tjsc.jus.br/`
- Acesso restrito PJSC (login gov.br): `https://app.tjsc.jus.br/restrito`
- Cadastro de credencial externa: `https://app.tjsc.jus.br/tjsc-novousuario/#/externo`

## Acesso

- **Login gov.br** nível **prata**+ é obrigatório.
- Além do gov.br, é preciso ter **credencial externa** no PJSC vinculada ao
  **mesmo CPF/CNPJ** da conta gov.br.

### Solicitante PESSOA JURÍDICA (CNPJ da Lanza)

- O **solicitante** da certidão é **quem está logado no gov.br** — não há campo
  nem seletor de "Perfis" na tela de requisição para trocar para a empresa
  (confirmado em inspeção: a conta PF aparece como "Perfis: solicitante", sem
  opção de PJ).
- Para a requisição sair em nome da **LANZA LOCAÇÕES (CNPJ)**, logar no gov.br
  com o **certificado digital e-CNPJ** da empresa. Alternativa: cadastrar o
  operador como **representante do CNPJ** no gov.br (procuração eletrônica) e
  logar como representante.
- Dados de contato padrão da requisição: e-mail `lanza.locacoes@gmail.com`,
  telefone `4898834442` (constante `TELEFONE_CONTATO_LANZA` em `tjsc.ts`).

## Emissão (certidão criminal)

1. Logar no acesso restrito (Entrar com GOV.BR).
2. Menu **Certidões de Antecedentes / Certidões → Requisição**.
3. Campos obrigatórios: **Nome**, **e-mail para resposta**, **Finalidade**.
   Opcionais (refinam): **CPF**, nome da mãe, nascimento.
   - A pesquisa é **fonética por nome**. Informar o CPF acrescenta os registros
     que contêm aquele CPF, além dos por nome.
4. O sistema processa e envia o **link de download por e-mail** (até 5 dias
   úteis). Modelos: Cível, Falência/Recuperação, **Criminal** (estadual).

## Por que é passo assistido na triagem

- Login gov.br + credencial PJSC não são automatizáveis sem credenciais do
  operador, e o **resultado vem por e-mail** (assíncrono, dias depois).
- A triagem apenas **abre o portal** e orienta o operador; marca a fonte como
  `assistido`. O PDF recebido por e-mail deve ser anexado manualmente ao caso.

## Alternativa de consulta imediata (sem certidão)

- **Consulta processual eproc / Consulta SAJ** (processos que tramitaram no
  antigo SAJ) permitem busca **por nome/CPF da parte** na interface, útil para um
  check rápido — mas não substitui a **certidão** oficial.
