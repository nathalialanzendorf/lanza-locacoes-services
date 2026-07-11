import {
  Card,
  CardBody,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  Row,
  Stack,
  Stat,
  Swatch,
  Text,
  useHostTheme,
} from "cursor/canvas";

const tabHeaders = ["Auto", "Título", "Descrição", "Placa", "Data", "Situação", "Valor"] as const;
const alinhamento = ["left", "left", "left", "left", "left", "left", "right"] as const;
const colunasTabela = "88px minmax(0, 1fr) minmax(0, 1.2fr) 88px 92px 96px 152px";
const celulaTabela = { padding: "8px 12px" } as const;
const celulaTotal = { padding: "2px 12px" } as const;

type LinhaTabela = {
  auto: string;
  titulo: string;
  descricao: string;
  placa: string;
  data: string;
  situacao: string;
  valor: number;
};

type Grupo = {
  titulo: string;
  contratoPlaca?: string;
  contratoMarcaModelo?: string;
  subtitulo?: string;
  linhas: LinhaTabela[];
  total: number;
};

type Bloco = {
  id: string;
  titulo: string;
  qtd: number;
  total: number;
  grupos: Grupo[];
};

const dados = __DADOS__ as {
  titulo: string;
  geradoEmBr: string;
  blocos: Bloco[];
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
  return itens.map((i) => [
    i.auto,
    i.titulo,
    i.descricao,
    i.placa,
    i.data,
    i.situacao,
    brl(i.valor),
  ]);
}

function alinharColuna(i: number): "left" | "right" {
  return alinhamento[i] === "right" ? "right" : "left";
}

function tituloGrupoCliente(grupo: Grupo): string {
  if (!grupo.contratoPlaca) return grupo.titulo;
  const veic = grupo.contratoMarcaModelo
    ? `${grupo.contratoPlaca} · ${grupo.contratoMarcaModelo}`
    : grupo.contratoPlaca;
  return `${grupo.titulo} — ${veic}`;
}

function corBloco(id: string): "green" | "gray" {
  return id === "ativo" ? "green" : "gray";
}

function TabelaCobranca({ linhas }: { linhas: string[][] }) {
  const theme = useHostTheme();
  if (linhas.length === 0) return null;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div
        style={{
          minWidth: 920,
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
                  wordBreak: ci === 1 || ci === 2 ? "break-word" : undefined,
                }}
              >
                {cell}
              </Text>
            ))}
          </Grid>
        ))}
      </div>
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

function colunasGridStats(qtd: number): number {
  if (qtd <= 1) return 1;
  if (qtd === 2) return 2;
  return 2;
}

export default function __COMPONENT_NAME__() {
  const theme = useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 1100 }}>
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
              Total em aberto
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

      {dados.blocos.length > 0 ? (
        <Grid columns={colunasGridStats(dados.blocos.length)} gap={16}>
          {dados.blocos.map((bloco) => (
            <Stat
              key={bloco.id}
              label={`${bloco.titulo} (${bloco.qtd})`}
              value={brl(bloco.total)}
            />
          ))}
        </Grid>
      ) : null}

      <Stack gap={8}>
        {dados.blocos.map((bloco) => (
          <CollapsibleSection
            key={bloco.id}
            title={bloco.titulo}
            count={bloco.qtd}
            leading={<Swatch color={corBloco(bloco.id)} />}
            trailing={
              <Text size="small" tone="tertiary">
                {brl(bloco.total)}
              </Text>
            }
            defaultOpen={bloco.id === "ativo"}
          >
            <Stack gap={10}>
              {bloco.grupos.map((grupo, gi) => (
                <CollapsibleSection
                  key={`${bloco.id}:${grupo.titulo}:${grupo.contratoPlaca ?? gi}`}
                  title={tituloGrupoCliente(grupo)}
                  count={grupo.linhas.length}
                  trailing={
                    <Text size="small" tone="tertiary">
                      {brl(grupo.total)}
                    </Text>
                  }
                  defaultOpen={bloco.id === "ativo" && gi === 0}
                >
                  <Stack gap={10}>
                    {grupo.subtitulo ? (
                      <Text tone="secondary" size="small">
                        {grupo.subtitulo}
                      </Text>
                    ) : null}
                    <TabelaCobranca linhas={linhasTabela(grupo.linhas)} />
                    <LinhaTotal rotulo="Subtotal em aberto" valor={grupo.total} />
                  </Stack>
                </CollapsibleSection>
              ))}
              <LinhaTotal
                rotulo={`Subtotal ${bloco.titulo.toLowerCase()} (em aberto)`}
                valor={bloco.total}
              />
            </Stack>
          </CollapsibleSection>
        ))}
      </Stack>

      <Divider />

      <LinhaTotal
        rotulo="Total em aberto"
        valor={dados.totalGeral}
        peso={700}
        cor={theme.category.orange}
      />
    </Stack>
  );
}
