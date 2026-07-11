import {
  Divider,
  Grid,
  H1,
  H2,
  Row,
  Stack,
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

const dados = {
  "titulo": "Pedágio em aberto",
  "geradoEmBr": "07/07/2026",
  "grupos": [
    {
      "titulo": "IWP-5G63 · RENAULT/SANDERO 1.6 Flex (2015/2015)",
      "subtitulo": "Juliano Foizer Silveira",
      "linhas": [
        {
          "descricao": "ATRASADO Pagamento pedágio 29/05/2026 18:45",
          "placa": "IWP-5G63",
          "data": "29/05/2026 18:45",
          "categoria": "Pedágio",
          "valor": 3
        }
      ],
      "total": 3
    },
    {
      "titulo": "IYR-8F19 · PEUGEOT/2008 STYLE EAT6 (2018/2019)",
      "subtitulo": "Laryssa (Gustavo) Costa de Quadros",
      "linhas": [
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
      "total": 36
    }
  ],
  "totalGeral": 39
} as {
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

export default function CobrancaSimplesPedagio() {
  const theme = useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 780 }}>
      <Stack gap={4}>
        <H1 style={{ textAlign: "center" }}>{dados.titulo}</H1>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          Gerado em {dados.geradoEmBr}
        </Text>
      </Stack>

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
