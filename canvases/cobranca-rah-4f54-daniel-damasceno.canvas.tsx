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
  "cliente": "Daniel Damasceno",
  "placa": "RAH-4F54",
  "modeloVeiculo": "FIAT/MOBI LIKE",
  "anoModelo": "2019/2020",
  "dataInicio": "29/05/2026",
  "dataFim": "25/11/2026",
  "qtdDiasContrato": 180,
  "dataAtual": "12/07/2026",
  "qtdDiasLocado": 44,
  "linhaEncerramento": null,
  "valorSemanal": 650,
  "valorDiaria": 120,
  "totalDebitos": 970,
  "infracoes": [],
  "totalInfracoes": 0,
  "infracoesPagas": [],
  "totalInfracoesPagas": 0,
  "manutencoes": [
    {
      "descricao": "ATRASADO Troca de Pneu",
      "placa": "MLX-2H34",
      "data": "01/05/2026",
      "categoria": "Manutenção",
      "valor": 320
    }
  ],
  "totalManutencoes": 320,
  "parcelasEmAberto": [
    {
      "descricao": "ATRASADO Pagamento semanal - Sábado 11",
      "placa": "RAH-4F54",
      "data": "11/07/2026",
      "categoria": "Locação semanal",
      "valor": 650
    }
  ],
  "totalParcelasEmAberto": 650,
  "totalSemanalCobrar": 650,
  "debitosDiversos": [],
  "totalDebitosDiversos": 0,
  "placasEscopo": [
    "RAH-4F54"
  ],
  "resumoSemanal": {
    "diaEscalonamento": 1,
    "tituloEscalonamento": "lembrete",
    "vencimentosEmAbertoBr": [
      "11/07/2026"
    ],
    "dataBloqueioBr": "13/07/2026",
    "totalReceber": 704.28,
    "diasAtrasados": 2,
    "diasEmDia": 0,
    "jurosMultaAcumulados": 54.28
  },
  "pagamentoSemanal": {
    "tabelas": [
      {
        "vencimentoBr": "11/07/2026",
        "periodoInicioBr": "11/07/2026",
        "periodoFimBr": "18/07/2026",
        "linhas": [
          {
            "dataBr": "11/07/2026",
            "diaSemana": "Sáb",
            "situacao": "Atrasado",
            "jurosMulta": 27.14,
            "totalDia": 120
          },
          {
            "dataBr": "12/07/2026",
            "diaSemana": "Dom",
            "situacao": "Atrasado",
            "jurosMulta": 27.14,
            "totalDia": 120
          },
          {
            "dataBr": "13/07/2026",
            "diaSemana": "Seg",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 92.86
          },
          {
            "dataBr": "14/07/2026",
            "diaSemana": "Ter",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 92.86
          },
          {
            "dataBr": "15/07/2026",
            "diaSemana": "Qua",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 92.86
          },
          {
            "dataBr": "16/07/2026",
            "diaSemana": "Qui",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 92.86
          },
          {
            "dataBr": "17/07/2026",
            "diaSemana": "Sex",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 92.86
          },
          {
            "dataBr": "18/07/2026",
            "diaSemana": "Sáb",
            "situacao": "Em dia",
            "jurosMulta": null,
            "totalDia": 92.86
          }
        ],
        "subtotalJurosMulta": 54.28,
        "total": 797.16
      }
    ],
    "totalGeral": 704.28,
    "dataPagamentoBr": "12/07/2026"
  },
  "mensagensWhatsApp": [
    {
      "tipo": "pagamento-semanal",
      "titulo": "🔔 Lembrete de pagamento — RAH-4F54",
      "texto": "🔔 *Lembrete de pagamento* — RAH-4F54\n\nOlá, Daniel! Tudo bem? 😊\nPassando para lembrar que a *parcela semanal* da locação do seu FIAT/MOBI LIKE está disponível para pagamento.\n\n💳 *Formas de pagamento*\n\n🔹 *PIX (CNPJ)*\n43.051.371/0001-05\n\n🔹 *Depósito via lotérica*\nFavorecido: Lanza Locações de Veiculos LTDA\nBanco: Caixa Econômica Federal\nAgência: 0410 • Operação: 1292\nConta: 576661724-7\n\nSe você já efetuou o pagamento, é só desconsiderar esta mensagem.\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "manutencao",
      "titulo": "Manutenção em aberto — MLX-2H34",
      "texto": "Manutenção em aberto — MLX-2H34\n\nOlá, Daniel! Há pendência de *manutenção* (responsabilidade do locatário) referente ao veículo locado.\n\nValor total pendente: *R$ 320,00*\n\nRegularize para evitar acúmulo no acerto. Responda neste canal se precisar de detalhes.\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "semanal-atraso",
      "titulo": "📊 Cálculo do atraso semanal — RAH-4F54",
      "texto": "📊 *Cálculo do atraso semanal* — RAH-4F54\n\nOlá, Daniel!\nSegue cálculo do atraso da locação do seu FIAT/MOBI LIKE:\n\nData bloqueio: 13/07/2026\nBase de cálculo: 12/07/2026\n\nVencimento em aberto: 11/07/2026\nJuros e multa: R$ 54,28 (2 diárias)\n*Total semana: R$ 650,00*\n\n*Total a devido : R$ 704,28 (2 dias em atraso)*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "despesas-em-aberto",
      "titulo": "📋 Despesas em aberto — RAH-4F54",
      "texto": "📋 *Despesas em aberto* — RAH-4F54\n\nOlá, Daniel!\nSegue a listagem das despesas referente à locação do seu FIAT/MOBI LIKE que segue em aberto:\n\n• MLX-2H34 · 01/05/2026 · ATRASADO Troca de Pneu · R$ 320,00\n• RAH-4F54 · 11/07/2026 · ATRASADO Pagamento semanal - Sábado 11 · R$ 650,00\n\n*Total em aberto: R$ 970,00*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
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

export default function CobrancaRah4f54DanielDamasceno() {
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
