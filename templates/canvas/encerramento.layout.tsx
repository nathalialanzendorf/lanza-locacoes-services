import {
  Callout,
  Card,
  CardBody,
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

const dados = __DADOS__ as {
  cliente: string;
  placa: string;
  modeloVeiculo: string;
  anoModelo: string;
  inicio: string;
  fimPrevisto: string;
  encerramento: string;
  diasLocacao: number;
  prazoDias: number;
  valorSemanal: number;
  valorDiaria: number;
  valorCaucao: number;
  retencaoCaucao: number;
  infracoes: LinhaTabela[];
  totalInfracoes: number;
  manutencoes: LinhaTabela[];
  totalManutencoes: number;
  parcelasEmAberto: LinhaTabela[];
  totalParcelasEmAberto: number;
  debitosDiversos: LinhaTabela[];
  totalDebitosDiversos: number;
  creditosDevolucao: LinhaTabela[];
  totalCreditosDevolucao: number;
  totalDebitos: number;
  totalCreditos: number;
  saldoFinal: number;
  linhaQuebraContrato: string;
  avisos: string[];
};

function brl(v: number): string {
  return (
    "R$ " +
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function brlDestaque(v: number, negativo = false): string {
  const n = Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const valor = `R$\u00A0${n}`;
  return negativo ? `\u2212\u00A0${valor}` : valor;
}

function linhasTabela(itens: LinhaTabela[]): string[][] {
  return itens.map((i) => [i.descricao, i.placa, i.data, i.categoria, brl(i.valor)]);
}

function alinharColuna(i: number): "left" | "right" {
  return alinhamento[i] === "right" ? "right" : "left";
}

function TabelaEncerramento({ linhas }: { linhas: string[][] }) {
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
  negativo = false,
  peso = 600,
  cor,
  compacto = false,
}: {
  valor: number;
  negativo?: boolean;
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
        wordBreak: "keep-all",
        overflowWrap: "normal",
        color: cor,
      }}
    >
      {brlDestaque(valor, negativo)}
    </div>
  );
}

function LinhaTotal({
  rotulo,
  valor,
  tone,
  negativo,
  peso,
  cor,
  compacto = false,
}: {
  rotulo: string;
  valor: number;
  tone?: "credit";
  negativo?: boolean;
  peso?: number;
  cor?: string;
  compacto?: boolean;
}) {
  const theme = useHostTheme();
  const exibirNegativo = negativo ?? tone === "credit";
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
      <ValorCelula
        valor={valor}
        negativo={exibirNegativo}
        peso={peso}
        cor={cor ?? (tone === "credit" ? theme.category.green : undefined)}
        compacto={compacto}
      />
    </Row>
  );
}

export default function __COMPONENT_NAME__() {
  const theme = useHostTheme();
  const complementar = dados.saldoFinal < 0;
  const saldoAbs = Math.abs(dados.saldoFinal);

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 780 }}>
      <Stack gap={4}>
        <H1 style={{ textAlign: "center" }}>Encerramento de contrato</H1>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          {dados.cliente} · {dados.placa} - {dados.modeloVeiculo} ({dados.anoModelo})
        </Text>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          {dados.inicio} → {dados.fimPrevisto} ({dados.prazoDias} dias de contrato) · Encerramento{" "}
          {dados.encerramento} ({dados.diasLocacao} dias de locação)
        </Text>
        <Text tone="secondary" size="small" style={{ textAlign: "center" }}>
          Fonte: cliente-despesas.json (espelho Rastreame) · encerramento {dados.encerramento}
        </Text>
      </Stack>

      <Card style={{ width: "100%" }}>
        <CardBody>
          <Stack gap={8} style={{ alignItems: "center", width: "100%" }}>
            <Text tone="secondary" size="small" style={{ textAlign: "center" }}>
              Saldo caução
            </Text>
            <Row justify="center" wrap={false} style={{ width: "100%", overflowX: "auto" }}>
              <div
                style={{
                  fontSize: 28,
                  lineHeight: "32px",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  wordBreak: "keep-all",
                  overflowWrap: "normal",
                  color: complementar ? theme.category.orange : theme.category.green,
                }}
              >
                {brlDestaque(saldoAbs, complementar)}
              </div>
            </Row>
            <Text tone="secondary" size="small" style={{ textAlign: "center" }}>
              {complementar
                ? "Locatário deve complementar além da caução"
                : "Valor a devolver ao locatário"}
            </Text>
          </Stack>
        </CardBody>
      </Card>

      <Grid columns={3} gap={16}>
        <Stat label="Locação semanal" value={brl(dados.valorSemanal)} />
        <Stat label="Caução" value={brl(dados.valorCaucao)} />
        <Stat label="Retenção (quebra)" value={brl(dados.retencaoCaucao)} />
      </Grid>

      {dados.infracoes.length > 0 && (
        <Stack gap={12}>
          <H2>Infrações (em aberto)</H2>
          <TabelaEncerramento linhas={linhasTabela(dados.infracoes)} />
          <LinhaTotal rotulo="Subtotal infrações" valor={dados.totalInfracoes} />
        </Stack>
      )}

      {dados.manutencoes.length > 0 && (
        <Stack gap={12}>
          <H2>Manutenção / avarias (em aberto)</H2>
          <TabelaEncerramento linhas={linhasTabela(dados.manutencoes)} />
          <LinhaTotal rotulo="Subtotal manutenção" valor={dados.totalManutencoes} />
        </Stack>
      )}

      {dados.parcelasEmAberto.length > 0 && (
        <Stack gap={12}>
          <H2>Parcelas semanais (em aberto)</H2>
          <TabelaEncerramento linhas={linhasTabela(dados.parcelasEmAberto)} />
          <LinhaTotal rotulo="Subtotal parcelas" valor={dados.totalParcelasEmAberto} />
        </Stack>
      )}

      {dados.debitosDiversos.length > 0 && (
        <Stack gap={12}>
          <H2>Outros valores (em aberto)</H2>
          <TabelaEncerramento linhas={linhasTabela(dados.debitosDiversos)} />
          <LinhaTotal rotulo="Subtotal outros" valor={dados.totalDebitosDiversos} />
        </Stack>
      )}

      {dados.creditosDevolucao.length > 0 && (
        <Stack gap={12}>
          <H2>Créditos a devolver ao locatário</H2>
          <TabelaEncerramento linhas={linhasTabela(dados.creditosDevolucao)} />
          <LinhaTotal
            rotulo="Subtotal créditos"
            valor={dados.totalCreditosDevolucao}
            tone="credit"
          />
        </Stack>
      )}

      <Callout tone="info">{dados.linhaQuebraContrato}</Callout>

      <Divider />

      <Stack gap={2}>
        <LinhaTotal rotulo="Total débitos" valor={dados.totalDebitos} compacto />
        <LinhaTotal rotulo="Total créditos" valor={dados.totalCreditos} tone="credit" compacto />
        <LinhaTotal
          rotulo="Saldo"
          valor={saldoAbs}
          negativo={complementar}
          peso={700}
          cor={complementar ? theme.category.orange : theme.category.green}
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
