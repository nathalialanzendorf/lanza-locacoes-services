import {
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

type Grupo = {
  titulo: string;
  subtitulo?: string;
  linhas: LinhaTabela[];
  total: number;
};

const dados = __DADOS__ as {
  titulo: string;
  geradoEmBr: string;
  grupos: Grupo[];
  totalGeral: number;
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

function LinhaTotal({
  rotulo,
  valor,
  peso,
  cor,
}: {
  rotulo: string;
  valor: number;
  peso?: number;
  cor?: string;
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
          padding: "8px 12px 8px 0",
        }}
      >
        {rotulo}
      </div>
      <div
        style={{
          ...celulaTotal,
          minWidth: 152,
          textAlign: "right",
          fontWeight: peso ?? 600,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          color: cor,
        }}
      >
        {brlDestaque(valor)}
      </div>
    </Row>
  );
}

function rotuloStatGrupo(grupo: Grupo): string {
  const placa = grupo.linhas[0]?.placa?.trim();
  if (placa) return placa;
  const parte = grupo.titulo.split(" · ")[0]?.trim();
  return parte || grupo.titulo;
}

function colunasGridGrupos(qtd: number): number {
  if (qtd <= 1) return 1;
  if (qtd === 2) return 2;
  if (qtd <= 4) return 2;
  return 3;
}

export default function __COMPONENT_NAME__() {
  const theme = useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 780 }}>
      <Stack gap={4}>
        <H1 style={{ textAlign: "center" }}>{dados.titulo}</H1>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          Gerado em {dados.geradoEmBr}
        </Text>
      </Stack>

      <Card style={{ width: "100%" }}>
        <CardBody>
          <Stack gap={8} style={{ alignItems: "center", width: "100%" }}>
            <Text tone="secondary" size="small" style={{ textAlign: "center" }}>
              Total geral
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
                {brlDestaque(dados.totalGeral)}
              </div>
            </Row>
          </Stack>
        </CardBody>
      </Card>

      {dados.grupos.length > 0 ? (
        <Grid columns={colunasGridGrupos(dados.grupos.length)} gap={16}>
          {dados.grupos.map((grupo) => (
            <Stat
              key={grupo.titulo}
              label={rotuloStatGrupo(grupo)}
              value={brl(grupo.total)}
            />
          ))}
        </Grid>
      ) : null}

      {dados.grupos.map((grupo) => (
        <Stack gap={12} key={grupo.titulo}>
          <Stack gap={2}>
            <H2>{grupo.titulo}</H2>
            {grupo.subtitulo ? <Text tone="secondary">{grupo.subtitulo}</Text> : null}
          </Stack>
          <TabelaCobranca linhas={linhasTabela(grupo.linhas)} />
          <LinhaTotal rotulo="Subtotal" valor={grupo.total} />
        </Stack>
      ))}

      <Divider />

      <LinhaTotal
        rotulo="Total geral"
        valor={dados.totalGeral}
        peso={700}
        cor={theme.category.orange}
      />
    </Stack>
  );
}
