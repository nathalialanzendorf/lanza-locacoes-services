import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
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
  "dataAtual": "05/07/2026",
  "qtdDiasLocado": 44,
  "valorSemanal": 800,
  "valorDiaria": 150,
  "totalDebitos": 1758.8,
  "infracoes": [
    {
      "descricao": "Multa velocidade - 02/03/2026 20:54 (Paga)",
      "placa": "OZC-0B50",
      "data": "02/03/2026 20:54",
      "categoria": "Infração",
      "valor": 130.16
    }
  ],
  "totalInfracoes": 0,
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
    }
  ],
  "totalParcelasEmAberto": 1330,
  "debitosDiversos": [
    {
      "descricao": "ATRASADO Pagamento renegociação - 3x8",
      "placa": "IYR-8F19",
      "data": "05/06/2026",
      "categoria": "Renegociação",
      "valor": 214.4
    },
    {
      "descricao": "ATRASADO Pagamento renegociação - 5x8",
      "placa": "IYR-8F19",
      "data": "19/06/2026",
      "categoria": "Renegociação",
      "valor": 214.4
    }
  ],
  "totalDebitosDiversos": 428.8,
  "resumoSemanal": {
    "diaEscalonamento": 3,
    "tituloEscalonamento": "bloqueio programado",
    "vencimentosEmAbertoBr": [
      "05/06/2026",
      "29/06/2026"
    ],
    "dataBloqueioBr": "08/06/2026",
    "totalReceber": 4650,
    "diasAtrasados": 31,
    "diasEmDia": 0,
    "jurosMultaAcumulados": 1107.01
  },
  "pagamentoSemanal": {
    "tabelas": [
      {
        "vencimentoBr": "05/06/2026",
        "periodoInicioBr": "05/06/2026",
        "periodoFimBr": "28/06/2026",
        "linhas": [
          {
            "dataBr": "05/06/2026",
            "diaSemana": "Sex",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "06/06/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "07/06/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "08/06/2026",
            "diaSemana": "Seg",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "09/06/2026",
            "diaSemana": "Ter",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "10/06/2026",
            "diaSemana": "Qua",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "11/06/2026",
            "diaSemana": "Qui",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "12/06/2026",
            "diaSemana": "Sex",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "13/06/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "14/06/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "15/06/2026",
            "diaSemana": "Seg",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "16/06/2026",
            "diaSemana": "Ter",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "17/06/2026",
            "diaSemana": "Qua",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "18/06/2026",
            "diaSemana": "Qui",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "19/06/2026",
            "diaSemana": "Sex",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "20/06/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "21/06/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "22/06/2026",
            "diaSemana": "Seg",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "23/06/2026",
            "diaSemana": "Ter",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "24/06/2026",
            "diaSemana": "Qua",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "25/06/2026",
            "diaSemana": "Qui",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "26/06/2026",
            "diaSemana": "Sex",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "27/06/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "28/06/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          }
        ],
        "subtotalJurosMulta": 857.04,
        "total": 3600
      },
      {
        "vencimentoBr": "29/06/2026",
        "periodoInicioBr": "29/06/2026",
        "periodoFimBr": "06/07/2026",
        "linhas": [
          {
            "dataBr": "29/06/2026",
            "diaSemana": "Seg",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "30/06/2026",
            "diaSemana": "Ter",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "01/07/2026",
            "diaSemana": "Qua",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "02/07/2026",
            "diaSemana": "Qui",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "03/07/2026",
            "diaSemana": "Sex",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "04/07/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "05/07/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 35.71,
            "totalDia": 150
          },
          {
            "dataBr": "06/07/2026",
            "diaSemana": "Seg",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 114.29
          }
        ],
        "subtotalJurosMulta": 249.97,
        "total": 1164.29
      }
    ],
    "totalGeral": 4764.29,
    "dataPagamentoBr": "05/07/2026"
  },
  "mensagensWhatsApp": [
    {
      "tipo": "pagamento-semanal",
      "titulo": "🚨 Bloqueio programado — IYR-8F19",
      "texto": "🚨 *Bloqueio programado* — IYR-8F19\n\nOlá, Laryssa!\nA *parcela semanal* da locação do seu PEUGEOT/2008 STYLE EAT6 segue em aberto.\nPor falta de compensação, o *bloqueio do veículo foi programado para as próximas horas*.\n\n💳 *Formas de pagamento*\n\n🔹 *PIX (CNPJ)*\n43.051.371/0001-05\n\n🔹 *Depósito via lotérica*\nFavorecido: Lanza Locações de Veiculos LTDA\nBanco: Caixa Econômica Federal\nAgência: 0410 • Operação: 1292\nConta: 576661724-7\n\nℹ️ A liberação do veículo está condicionada à quitação integral dos valores em atraso.\n\n📊 *Resumo do atraso*\nOlá, Laryssa!\nSegue cálculo do atraso das despesas referente à locação do seu PEUGEOT/2008 STYLE EAT6 que segue em aberto:\n\nData bloqueio: 08/06/2026\nBase de cálculo: 05/07/2026\n\nVencimento em aberto: 05/06/2026\nJuros e multa: R$ 857,04 (24 diárias)\n*Total semana: R$ 3.600,00*\n\nVencimento em aberto: 29/06/2026\nJuros e multa: R$ 249,97 (7 diárias)\n*Valor semana: R$ 1.164,29*\n\n*Total a devido : R$ 4.764,29 (31 dias em atraso)*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "renegociacao",
      "titulo": "Renegociação em aberto — IYR-8F19",
      "texto": "Renegociação em aberto — IYR-8F19\n\nOlá, Laryssa! Identificamos parcela(s) de *renegociação de débitos* em aberto referente ao veículo locado.\n\nValor total pendente: *R$ 428,80*\n\nRegularize o pagamento conforme combinado. Em caso de dúvida, responda neste canal.\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — OZC-0B50",
      "texto": "🚦 *Notificação de infração* — OZC-0B50\n\nOlá, Laryssa! Recebemos uma notificação de infração referente ao seu FORD/FOCUS SE 1.6 SEDAN GNV - PRETA:\n\n🚨 *Infração:* Multa velocidade - 02/03/2026 20:54\n🗓️ *Data/hora:* 02/03/2026 às 20:54\n📍 *Local:* SANGAO/SC\n💰 *Valor:* R$ 130,16\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "despesas-em-aberto",
      "titulo": "📋 Despesas em aberto — IYR-8F19",
      "texto": "📋 *Despesas em aberto* — IYR-8F19\n\nOlá, Laryssa!\nSegue a listagem das despesas referente à locação do seu PEUGEOT/2008 STYLE EAT6 que segue em aberto:\n\n• OZC-0B50 · 02/03/2026 20:54 · Multa velocidade - 02/03/2026 20:54 (Paga) · R$ 130,16\n• IYR-8F19 · 05/06/2026 · ATRASADO Pagamento semanal - Sexta 05 · R$ 800,00\n• IYR-8F19 · 05/06/2026 · ATRASADO Pagamento renegociação - 3x8 · R$ 214,40\n• IYR-8F19 · 19/06/2026 · ATRASADO Pagamento renegociação - 5x8 · R$ 214,40\n• IYR-8F19 · 29/06/2026 · ATRASADO Pagamento semanal - Sexta 29 · R$ 530,00\n\n*Total em aberto: R$ 1.758,80*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    }
  ],
  "avisos": []
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
  valorSemanal: number;
  valorDiaria: number;
  totalDebitos: number;
  infracoes: LinhaTabela[];
  totalInfracoes: number;
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

function mensagensWhatsAppVisiveis(
  mensagens: { titulo: string; texto: string; tipo?: string }[],
): typeof mensagens {
  const temDespesasEmAberto = mensagens.some((m) => m.tipo === "despesas-em-aberto");
  if (!temDespesasEmAberto) return mensagens;
  return mensagens.filter((m) => m.tipo !== "manutencao");
}

export default function CobrancaIyr8f19LaryssaGustavoCostaDeQuadros() {
  const theme = useHostTheme();
  const mensagensWhatsApp = mensagensWhatsAppVisiveis(dados.mensagensWhatsApp);

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

      {mensagensWhatsApp.length > 0 && (
        <Stack gap={12}>
          <H2>Mensagens WhatsApp</H2>
          {mensagensWhatsApp.map((m) => (
            <Card key={`${m.tipo ?? ""}-${m.titulo}`}>
              <CardHeader>{m.titulo}</CardHeader>
              <CardBody>
                <Text style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>
                  {m.texto}
                </Text>
              </CardBody>
            </Card>
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
