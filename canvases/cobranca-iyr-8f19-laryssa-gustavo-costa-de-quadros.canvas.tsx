import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Row,
  Stack,
  Stat,
  Text,
  useHostTheme,
} from "cursor/canvas";

const tabHeaders = ["Descrição", "Placa", "Data", "Categoria", "Valor"] as const;
const alinhamento = ["left", "left", "left", "left", "right"] as const;
const colunasTabela = "minmax(0, 1fr) 88px 92px 116px 152px";
const celulaTabela = { padding: "8px 12px" } as const;
const celulaTotal = { padding: "2px 12px" } as const;

type LinhaTabela = {
  descricao: string;
  placa: string;
  data: string;
  categoria: string;
  valor: number;
};

const tabHeadersSemanal = ["Data", "Dia", "Situação", "Juros e multa", "Total/dia"] as const;
const colunasTabelaSemanal = "92px 52px 88px 108px 108px";
const alinhamentoSemanal = ["left", "left", "left", "right", "right"] as const;

type LinhaSemanalAtraso = {
  dataBr: string;
  diaSemana: string;
  situacao: string;
  jurosMulta: number | null;
  totalDia: number;
};

type TabelaSemanalAtraso = {
  vencimentoBr: string;
  periodoInicioBr: string;
  periodoFimBr: string;
  linhas: LinhaSemanalAtraso[];
  subtotalJurosMulta: number;
  total: number;
};

type ResumoSemanalCanvas = {
  diaEscalonamento: number;
  tituloEscalonamento: string;
  vencimentosEmAbertoBr: string[];
  dataBloqueioBr: string;
  totalReceber: number;
  diasAtrasados: number;
  diasEmDia: number;
  jurosMultaAcumulados: number;
};

const dados = {
  "cliente": "Laryssa (Gustavo) Costa de Quadros",
  "placa": "IYR-8F19",
  "modeloVeiculo": "PEUGEOT/2008 STYLE EAT6",
  "anoModelo": "2018/2019",
  "dataInicio": "22/05/2026",
  "dataFim": "18/11/2026",
  "qtdDiasContrato": 180,
  "dataAtual": "12/07/2026",
  "qtdDiasLocado": 51,
  "linhaEncerramento": null,
  "valorSemanal": 800,
  "valorDiaria": 150,
  "totalDebitos": 3180.51,
  "infracoes": [
    {
      "descricao": "ATRASADO Multa velocidade - 02/03/2026 20:54",
      "placa": "OZC-0B50",
      "data": "02/03/2026 20:54:00",
      "categoria": "Infração",
      "valor": 130.16
    },
    {
      "descricao": "ATRASADO Multa velocidade - 09/05/2026 23:33",
      "placa": "OZC-0B50",
      "data": "09/05/2026 23:33:00",
      "categoria": "Infração",
      "valor": 130.16
    },
    {
      "descricao": "ATRASADO Multa velocidade - 09/05/2026 23:43",
      "placa": "OZC-0B50",
      "data": "09/05/2026 23:43:00",
      "categoria": "Infração",
      "valor": 130.16
    },
    {
      "descricao": "ATRASADO Multa trânsito - 09/05/2026 23:47",
      "placa": "OZC-0B50",
      "data": "09/05/2026 23:47:00",
      "categoria": "Infração",
      "valor": 195.23
    }
  ],
  "totalInfracoes": 585.71,
  "infracoesPagas": [],
  "totalInfracoesPagas": 0,
  "manutencoes": [],
  "totalManutencoes": 0,
  "parcelasEmAberto": [
    {
      "descricao": "ATRASADO Pagamento semanal - Sexta 05",
      "placa": "IYR-8F19",
      "data": "05/06/2026",
      "categoria": "Locação semanal",
      "valor": 800
    },
    {
      "descricao": "ATRASADO Pagamento semanal - Sexta 29",
      "placa": "IYR-8F19",
      "data": "29/06/2026",
      "categoria": "Locação semanal",
      "valor": 530
    },
    {
      "descricao": "ATRASADO Pagamento semanal - Sexta 10",
      "placa": "IYR-8F19",
      "data": "10/07/2026",
      "categoria": "Locação semanal",
      "valor": 800
    }
  ],
  "totalParcelasEmAberto": 2130,
  "totalSemanalCobrar": 2130,
  "debitosDiversos": [
    {
      "descricao": "ATRASADO Pagamento pedágio 29/05/2026 18:45",
      "placa": "IYR-8F19",
      "data": "29/05/2026 18:45",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 02/06/2026 09:12",
      "placa": "IYR-8F19",
      "data": "02/06/2026 09:12",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento renegociação - 3x8",
      "placa": "IYR-8F19",
      "data": "05/06/2026",
      "categoria": "Renegociação",
      "valor": 214.4
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 08/06/2026 14:56",
      "placa": "IYR-8F19",
      "data": "08/06/2026 14:56",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 11/06/2026 18:08",
      "placa": "IYR-8F19",
      "data": "11/06/2026 18:08",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento renegociação - 5x8",
      "placa": "IYR-8F19",
      "data": "19/06/2026",
      "categoria": "Renegociação",
      "valor": 214.4
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 24/06/2026 07:42",
      "placa": "IYR-8F19",
      "data": "24/06/2026 07:42",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 26/06/2026 20:55",
      "placa": "IYR-8F19",
      "data": "26/06/2026 20:55",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 29/06/2026 22:27",
      "placa": "IYR-8F19",
      "data": "29/06/2026 22:27",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 01/07/2026 10:03",
      "placa": "IYR-8F19",
      "data": "01/07/2026 10:03",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 01/07/2026 14:26",
      "placa": "IYR-8F19",
      "data": "01/07/2026 14:26",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 01/07/2026 19:54",
      "placa": "IYR-8F19",
      "data": "01/07/2026 19:54",
      "categoria": "Pedágio",
      "valor": 3
    },
    {
      "descricao": "ATRASADO Pagamento pedágio 01/07/2026 20:23",
      "placa": "IYR-8F19",
      "data": "01/07/2026 20:23",
      "categoria": "Pedágio",
      "valor": 6
    }
  ],
  "totalDebitosDiversos": 464.8,
  "placasEscopo": [
    "IYR-8F19"
  ],
  "resumoSemanal": {
    "diaEscalonamento": 3,
    "tituloEscalonamento": "bloqueio programado",
    "vencimentosEmAbertoBr": [
      "10/07/2026"
    ],
    "dataBloqueioBr": "12/07/2026",
    "totalReceber": 907.13,
    "diasAtrasados": 3,
    "diasEmDia": 0,
    "jurosMultaAcumulados": 107.13
  },
  "pagamentoSemanal": {
    "tabelas": [
      {
        "vencimentoBr": "10/07/2026",
        "periodoInicioBr": "10/07/2026",
        "periodoFimBr": "17/07/2026",
        "linhas": [
          {
            "dataBr": "10/07/2026",
            "diaSemana": "Sex",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "11/07/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "12/07/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "13/07/2026",
            "diaSemana": "Seg",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 114.29
          },
          {
            "dataBr": "14/07/2026",
            "diaSemana": "Ter",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 114.29
          },
          {
            "dataBr": "15/07/2026",
            "diaSemana": "Qua",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 114.29
          },
          {
            "dataBr": "16/07/2026",
            "diaSemana": "Qui",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 114.29
          },
          {
            "dataBr": "17/07/2026",
            "diaSemana": "Sex",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 114.29
          }
        ],
        "subtotalJurosMulta": 107.13,
        "total": 1021.45
      }
    ],
    "totalGeral": 907.13,
    "dataPagamentoBr": "12/07/2026"
  },
  "mensagensWhatsApp": [
    {
      "tipo": "pagamento-semanal",
      "titulo": "🚨 Bloqueio programado — IYR-8F19",
      "texto": "🚨 *Bloqueio programado* — IYR-8F19\n\nOlá, Laryssa!\nA *parcela semanal* da locação do seu PEUGEOT/2008 STYLE EAT6 segue em aberto.\nPor falta de compensação, o *bloqueio do veículo foi programado para as próximas horas*.\n\n💳 *Formas de pagamento*\n\n🔹 *PIX (CNPJ)*\n43.051.371/0001-05\n\n🔹 *Depósito via lotérica*\nFavorecido: Lanza Locações de Veiculos LTDA\nBanco: Caixa Econômica Federal\nAgência: 0410 • Operação: 1292\nConta: 576661724-7\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "renegociacao",
      "titulo": "Renegociação em aberto — IYR-8F19",
      "texto": "Renegociação em aberto — IYR-8F19\n\nOlá, Laryssa! Identificamos parcela(s) de *renegociação de débitos* em aberto referente ao veículo locado.\n\nValor total pendente: *R$ 428,80*\n\nRegularize o pagamento conforme combinado. Em caso de dúvida, responda neste canal.\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — OZC-0B50",
      "texto": "🚦 *Notificação de infração* — OZC-0B50\n\nOlá, Laryssa! Recebemos uma notificação de infração referente ao seu FORD/FOCUS SE 1.6 SEDAN GNV - PRETA:\n\n🚨 *Infração:* Multa velocidade - 02/03/2026 20:54\n🗓️ *Data/hora:* 02/03/2026 às 20:54:00\n📍 *Local:* SANGAO/SC\n💰 *Valor:* R$ 130,16\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — OZC-0B50",
      "texto": "🚦 *Notificação de infração* — OZC-0B50\n\nOlá, Laryssa! Recebemos uma notificação de infração referente ao seu FORD/FOCUS SE 1.6 SEDAN GNV - PRETA:\n\n🚨 *Infração:* Multa velocidade - 09/05/2026 23:33\n🗓️ *Data/hora:* 09/05/2026 às 23:33:00\n📍 *Local:* IMBITUBA/SC\n💰 *Valor:* R$ 130,16\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — OZC-0B50",
      "texto": "🚦 *Notificação de infração* — OZC-0B50\n\nOlá, Laryssa! Recebemos uma notificação de infração referente ao seu FORD/FOCUS SE 1.6 SEDAN GNV - PRETA:\n\n🚨 *Infração:* Multa velocidade - 09/05/2026 23:43\n🗓️ *Data/hora:* 09/05/2026 às 23:43:00\n📍 *Local:* GAROPABA/SC\n💰 *Valor:* R$ 130,16\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — OZC-0B50",
      "texto": "🚦 *Notificação de infração* — OZC-0B50\n\nOlá, Laryssa! Recebemos uma notificação de infração referente ao seu FORD/FOCUS SE 1.6 SEDAN GNV - PRETA:\n\n🚨 *Infração:* Multa trânsito - 09/05/2026 23:47\n🗓️ *Data/hora:* 09/05/2026 às 23:47:00\n📍 *Local:* PAULO LOPES/SC\n💰 *Valor:* R$ 195,23\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "pedagio",
      "titulo": "🛣️ Pedágio em aberto — IYR-8F19",
      "texto": "🛣️ *Pedágio em aberto* — IYR-8F19\n\nOlá, Laryssa! Identificamos uma pendência junto à *CCR Via Costeira* referente ao veículo locado.\n\nO não pagamento do pedágio caracteriza infração grave, sujeita a:\n🚫 Multa de *R$ 195,23*\n⚠️ *5 pontos* na CNH\n\nEvite transtornos e regularize de forma rápida pelo WhatsApp 👉 *+55 48 3211-3130*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "semanal-atraso",
      "titulo": "📊 Cálculo do atraso semanal — IYR-8F19",
      "texto": "📊 *Cálculo do atraso semanal* — IYR-8F19\n\nOlá, Laryssa!\nSegue cálculo do atraso da locação do seu PEUGEOT/2008 STYLE EAT6:\n\nData bloqueio: 12/07/2026\nBase de cálculo: 12/07/2026\n\nVencimento em aberto: 10/07/2026\nJuros e multa: R$ 107,13 (3 diárias)\n*Total semana: R$ 800,00*\n\n*Total a devido : R$ 907,13 (3 dias em atraso)*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "despesas-em-aberto",
      "titulo": "📋 Despesas em aberto — IYR-8F19",
      "texto": "📋 *Despesas em aberto* — IYR-8F19\n\nOlá, Laryssa!\nSegue a listagem das despesas referente à locação do seu PEUGEOT/2008 STYLE EAT6 que segue em aberto:\n\n• OZC-0B50 · 02/03/2026 20:54:00 · ATRASADO Multa velocidade - 02/03/2026 20:54 · R$ 130,16\n• OZC-0B50 · 09/05/2026 23:33:00 · ATRASADO Multa velocidade - 09/05/2026 23:33 · R$ 130,16\n• OZC-0B50 · 09/05/2026 23:43:00 · ATRASADO Multa velocidade - 09/05/2026 23:43 · R$ 130,16\n• OZC-0B50 · 09/05/2026 23:47:00 · ATRASADO Multa trânsito - 09/05/2026 23:47 · R$ 195,23\n• IYR-8F19 · 29/05/2026 18:45 · ATRASADO Pagamento pedágio 29/05/2026 18:45 · R$ 3,00\n• IYR-8F19 · 02/06/2026 09:12 · ATRASADO Pagamento pedágio 02/06/2026 09:12 · R$ 3,00\n• IYR-8F19 · 05/06/2026 · ATRASADO Pagamento semanal - Sexta 05 · R$ 800,00\n• IYR-8F19 · 05/06/2026 · ATRASADO Pagamento renegociação - 3x8 · R$ 214,40\n• IYR-8F19 · 08/06/2026 14:56 · ATRASADO Pagamento pedágio 08/06/2026 14:56 · R$ 3,00\n• IYR-8F19 · 11/06/2026 18:08 · ATRASADO Pagamento pedágio 11/06/2026 18:08 · R$ 3,00\n• IYR-8F19 · 19/06/2026 · ATRASADO Pagamento renegociação - 5x8 · R$ 214,40\n• IYR-8F19 · 24/06/2026 07:42 · ATRASADO Pagamento pedágio 24/06/2026 07:42 · R$ 3,00\n• IYR-8F19 · 26/06/2026 20:55 · ATRASADO Pagamento pedágio 26/06/2026 20:55 · R$ 3,00\n• IYR-8F19 · 29/06/2026 · ATRASADO Pagamento semanal - Sexta 29 · R$ 530,00\n• IYR-8F19 · 29/06/2026 22:27 · ATRASADO Pagamento pedágio 29/06/2026 22:27 · R$ 3,00\n• IYR-8F19 · 01/07/2026 10:03 · ATRASADO Pagamento pedágio 01/07/2026 10:03 · R$ 3,00\n• IYR-8F19 · 01/07/2026 14:26 · ATRASADO Pagamento pedágio 01/07/2026 14:26 · R$ 3,00\n• IYR-8F19 · 01/07/2026 19:54 · ATRASADO Pagamento pedágio 01/07/2026 19:54 · R$ 3,00\n• IYR-8F19 · 01/07/2026 20:23 · ATRASADO Pagamento pedágio 01/07/2026 20:23 · R$ 6,00\n• IYR-8F19 · 10/07/2026 · ATRASADO Pagamento semanal - Sexta 10 · R$ 800,00\n\n*Total em aberto: R$ 3.180,51*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    }
  ],
  "avisos": [
    "Acordo: vencimentos 05/06/2026, 29/06/2026 sem juros/bloqueio (anteriores a 09/07/2026)."
  ]
} as {
  cliente: string;
  placa: string;
  modeloVeiculo: string;
  anoModelo: string;
  dataInicio: string;
  dataFim: string;
  qtdDiasContrato: number;
  dataAtual: string;
  qtdDiasLocado: number;
  linhaEncerramento?: string | null;
  valorSemanal: number;
  valorDiaria: number;
  totalDebitos: number;
  infracoes: LinhaTabela[];
  totalInfracoes: number;
  infracoesPagas: LinhaTabela[];
  totalInfracoesPagas: number;
  manutencoes: LinhaTabela[];
  totalManutencoes: number;
  parcelasEmAberto: LinhaTabela[];
  totalParcelasEmAberto: number;
  debitosDiversos: LinhaTabela[];
  totalDebitosDiversos: number;
  resumoSemanal: ResumoSemanalCanvas | null;
  pagamentoSemanal: { tabelas: TabelaSemanalAtraso[]; totalGeral: number; dataPagamentoBr?: string } | null;
  mensagensWhatsApp: { titulo: string; texto: string; tipo?: string }[];
  avisos: string[];
};

function brl(v: number): string {
  return (
    "R$ " +
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function brlDestaque(v: number): string {
  const n = Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R$\u00A0${n}`;
}

function linhasTabela(itens: LinhaTabela[]): string[][] {
  return itens.map((i) => [i.descricao, i.placa, i.data, i.categoria, brl(i.valor)]);
}

function alinharColuna(i: number): "left" | "right" {
  return alinhamento[i] === "right" ? "right" : "left";
}

function parseDataBr(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function jurosPorSemana(
  tabelas: TabelaSemanalAtraso[],
  dataPagamentoBr: string,
): Array<{ vencimentoBr: string; jurosMulta: number; dias: number; totalDevido: number }> {
  const corte = parseDataBr(dataPagamentoBr);
  if (!corte) return [];
  const out: Array<{ vencimentoBr: string; jurosMulta: number; dias: number; totalDevido: number }> = [];
  for (const tabela of tabelas) {
    let juros = 0;
    let dias = 0;
    for (const linha of tabela.linhas) {
      const d = parseDataBr(linha.dataBr);
      if (!d || d.getTime() > corte.getTime()) continue;
      if (linha.situacao === "Atrasado" && linha.jurosMulta != null) {
        juros += linha.jurosMulta;
        dias++;
      }
    }
    if (dias > 0) {
      out.push({
        vencimentoBr: tabela.vencimentoBr,
        jurosMulta: Math.round(juros * 100) / 100,
        dias,
        totalDevido: tabela.total,
      });
    }
  }
  return out;
}

function TabelaCobranca({ linhas }: { linhas: string[][] }) {
  const theme = useHostTheme();
  if (linhas.length === 0) return null;
  return (
    <div
      style={{
        width: "100%",
        border: `1px solid ${theme.stroke.secondary}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Grid
        columns={colunasTabela}
        gap={0}
        style={{
          background: theme.fill.quaternary,
          borderBottom: `1px solid ${theme.stroke.secondary}`,
        }}
      >
        {tabHeaders.map((h, i) => (
          <Text weight="semibold" style={{ ...celulaTabela, textAlign: alinharColuna(i) }}>
            {h}
          </Text>
        ))}
      </Grid>
      {linhas.map((row, ri) => (
        <Grid
          columns={colunasTabela}
          gap={0}
          style={{
            borderBottom:
              ri < linhas.length - 1 ? `1px solid ${theme.stroke.tertiary}` : undefined,
          }}
        >
          {row.map((cell, ci) => (
            <Text
              style={{
                ...celulaTabela,
                textAlign: alinharColuna(ci),
                wordBreak: ci === 0 ? "break-word" : undefined,
              }}
            >
              {cell}
            </Text>
          ))}
        </Grid>
      ))}
    </div>
  );
}

function ValorCelula({
  valor,
  peso = 600,
  cor,
  compacto = false,
}: {
  valor: number;
  peso?: number;
  cor?: string;
  compacto?: boolean;
}) {
  return (
    <div
      style={{
        ...(compacto ? celulaTotal : celulaTabela),
        minWidth: 152,
        textAlign: "right",
        fontWeight: peso,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        color: cor,
      }}
    >
      {brlDestaque(valor)}
    </div>
  );
}

function LinhaTotal({
  rotulo,
  valor,
  peso,
  cor,
  compacto = false,
}: {
  rotulo: string;
  valor: number;
  peso?: number;
  cor?: string;
  compacto?: boolean;
}) {
  return (
    <Row wrap={false} align="center" style={{ width: "100%" }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "right",
          fontWeight: peso ?? 600,
          whiteSpace: "nowrap",
          ...(compacto ? celulaTotal : { padding: "8px 12px 8px 0" }),
        }}
      >
        {rotulo}
      </div>
      <ValorCelula valor={valor} peso={peso} cor={cor} compacto={compacto} />
    </Row>
  );
}

function TabelaSemanalAtraso({ tabela }: { tabela: TabelaSemanalAtraso }) {
  const theme = useHostTheme();
  const linhas = tabela.linhas.map((l) => [
    l.dataBr,
    l.diaSemana,
    l.situacao,
    l.jurosMulta != null ? brl(l.jurosMulta) : "—",
    brl(l.totalDia),
  ]);
  const diasJuros = tabela.linhas.filter((l) => l.jurosMulta != null).length;

  return (
    <Stack gap={8}>
      <Text weight="semibold">
        Semana venc. {tabela.vencimentoBr} ({tabela.periodoInicioBr} a {tabela.periodoFimBr})
      </Text>
      <div
        style={{
          width: "100%",
          border: `1px solid ${theme.stroke.secondary}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <Grid
          columns={colunasTabelaSemanal}
          gap={0}
          style={{
            background: theme.fill.quaternary,
            borderBottom: `1px solid ${theme.stroke.secondary}`,
          }}
        >
          {tabHeadersSemanal.map((h, i) => (
            <Text
              weight="semibold"
              style={{
                padding: "8px 10px",
                textAlign: alinhamentoSemanal[i] === "right" ? "right" : "left",
                fontSize: 12,
              }}
            >
              {h}
            </Text>
          ))}
        </Grid>
        {linhas.map((row, ri) => (
          <Grid
            columns={colunasTabelaSemanal}
            gap={0}
            style={{
              borderBottom:
                ri < linhas.length - 1 ? `1px solid ${theme.stroke.tertiary}` : undefined,
            }}
          >
            {row.map((cell, ci) => (
              <Text
                style={{
                  padding: "6px 10px",
                  textAlign: alinhamentoSemanal[ci] === "right" ? "right" : "left",
                  fontSize: 12,
                  fontVariantNumeric: ci >= 3 ? "tabular-nums" : undefined,
                }}
              >
                {cell}
              </Text>
            ))}
          </Grid>
        ))}
      </div>
      <LinhaTotal rotulo={`Juros e multa (${diasJuros} dias)`} valor={tabela.subtotalJurosMulta} compacto />
      <LinhaTotal rotulo={`Total semana venc. ${tabela.vencimentoBr}`} valor={tabela.total} compacto />
    </Stack>
  );
}

function SecaoPagamentoSemanalAtraso() {
  const resumo = dados.resumoSemanal;
  const pagamento = dados.pagamentoSemanal;
  if (!pagamento?.tabelas?.length) return null;

  const dataBase = pagamento.dataPagamentoBr ?? dados.dataAtual;
  const jurosSemanas = jurosPorSemana(pagamento.tabelas, dataBase);

  return (
    <Stack gap={12}>
      <H2>Pagamento semanal em atraso (diária)</H2>
      {resumo && (
        <Card>
          <CardBody>
            <Stack gap={4}>
              <Text tone="secondary">Data bloqueio: {resumo.dataBloqueioBr}</Text>
              <Text tone="secondary">Base de cálculo: {dataBase}</Text>
              {jurosSemanas.map((s, i) => (
                <Stack gap={2}>
                  <Text tone="secondary">Vencimento em aberto: {s.vencimentoBr}</Text>
                  <Text>
                    Juros e multa: {brl(s.jurosMulta)} ({s.dias}{" "}
                    {s.dias === 1 ? "diária" : "diárias"})
                  </Text>
                  <Text weight="semibold">
                    {i === 0 ? "Total semana" : "Valor semana"}: {brl(s.totalDevido)}
                  </Text>
                </Stack>
              ))}
              {jurosSemanas.length > 0 && (
                <Text weight="semibold">
                  Total a devido : {brl(pagamento.totalGeral)} (
                  {jurosSemanas.reduce((n, s) => n + s.dias, 0)}{" "}
                  {jurosSemanas.reduce((n, s) => n + s.dias, 0) === 1 ? "dia" : "dias"} em atraso)
                </Text>
              )}
            </Stack>
          </CardBody>
        </Card>
      )}
      {pagamento.tabelas.map((t) => (
        <TabelaSemanalAtraso tabela={t} />
      ))}
      <LinhaTotal rotulo="Total geral (diária)" valor={pagamento.totalGeral} peso={700} />
    </Stack>
  );
}

function agruparMensagensPorTipo(
  mensagens: { titulo: string; texto: string; tipo?: string }[],
): Array<{ tipo: string; rotulo: string; mensagens: typeof mensagens }> {
  const ordem = [
    "pagamento-semanal",
    "semanal-atraso",
    "infracoes",
    "renegociacao",
    "pedagio",
    "estacionamento-rotativo",
    "manutencao",
    "despesas-em-aberto",
  ];
  const rotulos: Record<string, string> = {
    "pagamento-semanal": "Pagamento semanal",
    "semanal-atraso": "Atraso semanal (juros e multa)",
    infracoes: "Infrações",
    renegociacao: "Renegociação",
    pedagio: "Pedágio",
    "estacionamento-rotativo": "Estacionamento rotativo",
    manutencao: "Manutenção",
    "despesas-em-aberto": "Despesas em aberto",
  };
  const porTipo = new Map<string, typeof mensagens>();
  for (const m of mensagens) {
    const tipo = m.tipo ?? "outros";
    const lista = porTipo.get(tipo) ?? [];
    lista.push(m);
    porTipo.set(tipo, lista);
  }
  return [...porTipo.entries()]
    .sort(([a], [b]) => {
      const ia = ordem.indexOf(a);
      const ib = ordem.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([tipo, msgs]) => ({
      tipo,
      rotulo: rotulos[tipo] ?? tipo,
      mensagens: msgs,
    }));
}

export default function CobrancaIyr8f19LaryssaGustavoCostaDeQuadros() {
  const theme = useHostTheme();
  const gruposWhatsApp = agruparMensagensPorTipo(dados.mensagensWhatsApp);

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 780 }}>
      <Stack gap={4}>
        <H1 style={{ textAlign: "center" }}>Relatório de cobranças</H1>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          {dados.cliente} · {dados.placa} - {dados.modeloVeiculo} ({dados.anoModelo})
        </Text>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          {dados.dataInicio} → {dados.dataFim} ({dados.qtdDiasContrato} dias de contrato) · Gerado em{" "}
          {dados.dataAtual} ({dados.qtdDiasLocado} dias de locação)
        </Text>
        {dados.linhaEncerramento ? (
          <Text tone="secondary" style={{ textAlign: "center" }}>
            {dados.linhaEncerramento}
          </Text>
        ) : null}
      </Stack>

      <Card style={{ width: "100%" }}>
        <CardBody>
          <Stack gap={8} style={{ alignItems: "center", width: "100%" }}>
            <Text tone="secondary" size="small" style={{ textAlign: "center" }}>
              Total a cobrar
            </Text>
            <Row justify="center" wrap={false} style={{ width: "100%", overflowX: "auto" }}>
              <div
                style={{
                  fontSize: 28,
                  lineHeight: "32px",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  color: theme.category.orange,
                }}
              >
                {brlDestaque(dados.totalDebitos)}
              </div>
            </Row>
          </Stack>
        </CardBody>
      </Card>

      <Grid columns={2} gap={16}>
        <Stat label="Locação semanal" value={brl(dados.valorSemanal)} />
        <Stat label="Diária atraso" value={brl(dados.valorDiaria)} />
      </Grid>

      {dados.infracoes.length > 0 && (
        <Stack gap={12}>
          <H2>Infrações (em aberto)</H2>
          <TabelaCobranca linhas={linhasTabela(dados.infracoes)} />
          <LinhaTotal rotulo="Subtotal infrações" valor={dados.totalInfracoes} />
        </Stack>
      )}

      {dados.infracoesPagas.length > 0 && (
        <Stack gap={12}>
          <H2>Infrações (pagas)</H2>
          <TabelaCobranca linhas={linhasTabela(dados.infracoesPagas)} />
          <LinhaTotal rotulo="Subtotal infrações pagas" valor={dados.totalInfracoesPagas} />
        </Stack>
      )}

      {dados.manutencoes.length > 0 && (
        <Stack gap={12}>
          <H2>Manutenção / avarias (em aberto)</H2>
          <TabelaCobranca linhas={linhasTabela(dados.manutencoes)} />
          <LinhaTotal rotulo="Subtotal manutenção" valor={dados.totalManutencoes} />
        </Stack>
      )}

      {dados.parcelasEmAberto.length > 0 && (
        <Stack gap={12}>
          <H2>Parcelas semanais (em aberto)</H2>
          <TabelaCobranca linhas={linhasTabela(dados.parcelasEmAberto)} />
          <LinhaTotal rotulo="Subtotal parcelas" valor={dados.totalParcelasEmAberto} />
        </Stack>
      )}

      {dados.debitosDiversos.length > 0 && (
        <Stack gap={12}>
          <H2>Outros valores (em aberto)</H2>
          <TabelaCobranca linhas={linhasTabela(dados.debitosDiversos)} />
          <LinhaTotal rotulo="Subtotal outros" valor={dados.totalDebitosDiversos} />
        </Stack>
      )}

      <SecaoPagamentoSemanalAtraso />

      {gruposWhatsApp.length > 0 && (
        <Stack gap={12}>
          <H2>Mensagens WhatsApp</H2>
          {gruposWhatsApp.map((grupo) => (
            <Stack key={grupo.tipo} gap={8}>
              <H3>{grupo.rotulo}</H3>
              {grupo.mensagens.map((m) => (
                <Card key={`${grupo.tipo}-${m.titulo}`}>
                  <CardHeader>{m.titulo}</CardHeader>
                  <CardBody>
                    <Text style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>
                      {m.texto}
                    </Text>
                  </CardBody>
                </Card>
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      <Divider />

      <Stack gap={2}>
        <LinhaTotal
          rotulo="Total a cobrar"
          valor={dados.totalDebitos}
          peso={700}
          cor={theme.category.orange}
          compacto
        />
      </Stack>

      {dados.avisos.length > 0 && (
        <Stack gap={8}>
          <H2>Avisos (operador)</H2>
          <Stack gap={6}>
            {dados.avisos.map((a) => (
              <Callout tone="warning">{a}</Callout>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
