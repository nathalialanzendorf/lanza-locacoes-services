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
  "cliente": "Tiago Augusto da Silva Piareti",
  "placa": "IXT-7I93",
  "modeloVeiculo": "RENAULT/SANDERO 1.0 Flex",
  "anoModelo": "2017/2017",
  "dataInicio": "24/03/2026",
  "dataFim": "22/06/2026",
  "qtdDiasContrato": 90,
  "dataAtual": "06/07/2026",
  "qtdDiasLocado": 104,
  "valorSemanal": 650,
  "valorDiaria": 120,
  "totalDebitos": 717.1,
  "infracoes": [
    {
      "descricao": "Multa parada - 02/04/2026 14:30 (Advertida)",
      "placa": "IXT-7I93",
      "data": "02/04/2026 14:30:03",
      "categoria": "Infração",
      "valor": 88.38
    },
    {
      "descricao": "ATRASADO Multa parada - 16/04/2026",
      "placa": "IXT-7I93",
      "data": "16/04/2026 07:57:46",
      "categoria": "Infração",
      "valor": 130.16
    },
    {
      "descricao": "ATRASADO Multa celular - 27/05/2026 08:09",
      "placa": "IXT-7I93",
      "data": "27/05/2026 08:09:55",
      "categoria": "Infração",
      "valor": 293.47
    },
    {
      "descricao": "ATRASADO Multa celular - 27/05/2026 08:30",
      "placa": "IXT-7I93",
      "data": "27/05/2026 08:30:11",
      "categoria": "Infração",
      "valor": 293.47
    }
  ],
  "totalInfracoes": 717.1,
  "manutencoes": [],
  "totalManutencoes": 0,
  "parcelasEmAberto": [],
  "totalParcelasEmAberto": 0,
  "debitosDiversos": [],
  "totalDebitosDiversos": 0,
  "resumoSemanal": null,
  "pagamentoSemanal": null,
  "mensagensWhatsApp": [
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — IXT-7I93",
      "texto": "🚦 *Notificação de infração* — IXT-7I93\n\nOlá, Tiago! Recebemos uma notificação de infração referente ao seu RENAULT/SANDERO 1.0 Flex - Preto:\n\n🚨 *Infração:* Multa parada - 16/04/2026\n🗓️ *Data/hora:* 16/04/2026 às 07:57:46\n📍 *Local:* TUBARAO/SC\n💰 *Valor:* R$ 130,16\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — IXT-7I93",
      "texto": "🚦 *Notificação de infração* — IXT-7I93\n\nOlá, Tiago! Recebemos uma notificação de infração referente ao seu RENAULT/SANDERO 1.0 Flex - Preto:\n\n🚨 *Infração:* Multa celular - 27/05/2026 08:09\n🗓️ *Data/hora:* 27/05/2026 às 08:09:55\n📍 *Local:* TUBARAO/SC\n💰 *Valor:* R$ 293,47\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "infracoes",
      "titulo": "🚦 Notificação de infração — IXT-7I93",
      "texto": "🚦 *Notificação de infração* — IXT-7I93\n\nOlá, Tiago! Recebemos uma notificação de infração referente ao seu RENAULT/SANDERO 1.0 Flex - Preto:\n\n🚨 *Infração:* Multa celular - 27/05/2026 08:30\n🗓️ *Data/hora:* 27/05/2026 às 08:30:11\n📍 *Local:* TUBARAO/SC\n💰 *Valor:* R$ 293,47\n\nConforme o contrato de locação, a *responsabilidade financeira* e a *indicação de condutor* (pontuação) são do locatário.\n\nPodemos agendar a regularização para quando? Assim você evita cobranças adicionais. 🙂\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
    },
    {
      "tipo": "despesas-em-aberto",
      "titulo": "📋 Despesas em aberto — IXT-7I93",
      "texto": "📋 *Despesas em aberto* — IXT-7I93\n\nOlá, Tiago!\nSegue a listagem das despesas referente à locação do seu RENAULT/SANDERO 1.0 Flex que segue em aberto:\n\n• IXT-7I93 · 02/04/2026 14:30:03 · Multa parada - 02/04/2026 14:30 (Advertida) · R$ 88,38\n• IXT-7I93 · 16/04/2026 07:57:46 · ATRASADO Multa parada - 16/04/2026 · R$ 130,16\n• IXT-7I93 · 27/05/2026 08:09:55 · ATRASADO Multa celular - 27/05/2026 08:09 · R$ 293,47\n• IXT-7I93 · 27/05/2026 08:30:11 · ATRASADO Multa celular - 27/05/2026 08:30 · R$ 293,47\n\n*Total em aberto: R$ 717,10*\n\n_Mensagem automática enviada pelo sistema Gerenciador de Locações Veiculares._\n"
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

export default function CobrancaIxt7i93TiagoAugustoDaSilvaPiareti() {
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
