import {
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

const tabHeadersSemPlaca = [
  "Auto",
  "Data",
  "Cliente/Parceiro",
  "Descrição",
  "Valor",
  "Paga DETRAN",
  "Paga Lanza",
] as const;
const alinhamentoSemPlaca = ["left", "left", "left", "left", "right", "left", "left"] as const;
const colunasTabelaSemPlaca =
  "88px 108px minmax(0, 1fr) minmax(0, 1.2fr) 88px 72px 72px";
const celulaTabela = { padding: "8px 10px", fontSize: 12 } as const;
const celulaTotal = { padding: "2px 12px" } as const;

type Linha = {
  placa: string;
  modelo?: string;
  ano?: string;
  numeroAuto: string;
  data: string;
  cliente: string;
  descricao: string;
  valor: number;
  pagaDetran: string;
  pagaLanza: string;
  cobravel: boolean;
};

type GrupoVeiculo = {
  placa: string;
  modelo: string;
  ano: string;
  cliente: string;
  linhas: Linha[];
  total: number;
};

type Subgrupo = {
  id: string;
  titulo: string;
  qtd: number;
  total: number;
  linhas: Linha[];
};

type Bloco = {
  id: string;
  titulo: string;
  descricao: string;
  qtd: number;
  total: number;
  subgrupos: Subgrupo[];
};

const dados = __DADOS__ as {
  titulo: string;
  geradoEmBr: string;
  fonte: string;
  totalInfracoes: number;
  totalPlacas: number;
  totalGeral: number;
  totalCobravel: number;
  blocos: Bloco[];
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

function linhasTabelaVeiculo(itens: Linha[]): string[][] {
  return itens.map((i) => [
    i.numeroAuto,
    i.data,
    i.cliente,
    i.descricao,
    brl(i.valor),
    i.pagaDetran,
    i.pagaLanza,
  ]);
}

function agruparPorVeiculo(linhas: Linha[]): GrupoVeiculo[] {
  const porPlaca = new Map<string, Linha[]>();
  for (const linha of linhas) {
    const key = linha.placa || "—";
    const lista = porPlaca.get(key) ?? [];
    lista.push(linha);
    porPlaca.set(key, lista);
  }

  return [...porPlaca.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([placa, items]) => ({
      placa,
      modelo: items[0]?.modelo?.trim() || "",
      ano: items[0]?.ano?.trim() || "",
      cliente:
        items.find((i) => i.cliente && i.cliente !== "—")?.cliente ??
        items[0]?.cliente ??
        "—",
      linhas: items,
      total: items.reduce((sum, i) => sum + i.valor, 0),
    }));
}

function tituloVeiculo(grupo: GrupoVeiculo): string {
  if (grupo.modelo) {
    return `${grupo.placa} · ${grupo.modelo}${grupo.ano ? ` (${grupo.ano})` : ""}`;
  }
  return grupo.placa;
}

function alinharColunaSemPlaca(i: number): "left" | "right" {
  return alinhamentoSemPlaca[i] === "right" ? "right" : "left";
}

function TabelaInfracoesVeiculo({ linhas }: { linhas: string[][] }) {
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
        columns={colunasTabelaSemPlaca}
        gap={0}
        style={{
          background: theme.fill.quaternary,
          borderBottom: `1px solid ${theme.stroke.secondary}`,
        }}
      >
        {tabHeadersSemPlaca.map((h, i) => (
          <Text weight="semibold" style={{ ...celulaTabela, textAlign: alinharColunaSemPlaca(i) }}>
            {h}
          </Text>
        ))}
      </Grid>
      {linhas.map((row, ri) => (
        <Grid
          columns={colunasTabelaSemPlaca}
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
                textAlign: alinharColunaSemPlaca(ci),
                wordBreak: ci === 3 ? "break-word" : undefined,
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

function corBloco(id: string): "orange" | "yellow" | "gray" | "cyan" {
  if (id === "cliente") return "orange";
  if (id === "parceiro") return "cyan";
  if (id === "pendente") return "yellow";
  return "gray";
}

function corSubgrupo(id: string): "red" | "green" | "cyan" | "yellow" | "purple" | "gray" {
  if (id === "cobravel-aberto") return "red";
  if (id === "paga-lanza") return "green";
  if (id === "sem-locatario") return "cyan";
  if (id === "nao-identificado") return "yellow";
  if (id === "anterior-locacao") return "cyan";
  if (id === "cliente-faltando") return "yellow";
  if (id === "sem-contrato") return "purple";
  return "gray";
}

export default function __COMPONENT_NAME__() {
  const theme = useHostTheme();

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 960 }}>
      <Stack gap={4}>
        <H1 style={{ textAlign: "center" }}>{dados.titulo}</H1>
        <Text tone="secondary" style={{ textAlign: "center" }}>
          Gerado em {dados.geradoEmBr} · {dados.fonte}
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat label="Infrações" value={String(dados.totalInfracoes)} />
        <Stat label="Placas" value={String(dados.totalPlacas)} />
        <Stat label="Total geral" value={brl(dados.totalGeral)} />
        <Stat label="Cobrável (locatário)" value={brl(dados.totalCobravel)} />
      </Grid>

      <Stack gap={4}>
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
            defaultOpen={bloco.id === "cliente"}
          >
            <Stack gap={10}>
              <Text tone="secondary" size="small">
                {bloco.descricao}
              </Text>

              {bloco.subgrupos.map((sub) => (
                <CollapsibleSection
                  key={`${bloco.id}-${sub.id}`}
                  title={sub.titulo}
                  count={sub.qtd}
                  leading={<Swatch color={corSubgrupo(sub.id)} />}
                  trailing={
                    <Text size="small" tone="tertiary">
                      {brl(sub.total)}
                    </Text>
                  }
                  defaultOpen={sub.id === "cobravel-aberto"}
                >
                  <Stack gap={6}>
                    {agruparPorVeiculo(sub.linhas).map((veiculo, vi) => (
                      <CollapsibleSection
                        key={`${bloco.id}-${sub.id}-${veiculo.placa}`}
                        title={tituloVeiculo(veiculo)}
                        count={veiculo.linhas.length}
                        trailing={
                          <Text size="small" tone="tertiary">
                            {veiculo.cliente !== "—" ? `${veiculo.cliente} · ` : ""}
                            {brl(veiculo.total)}
                          </Text>
                        }
                        defaultOpen={sub.id === "cobravel-aberto" && vi === 0}
                      >
                        <TabelaInfracoesVeiculo linhas={linhasTabelaVeiculo(veiculo.linhas)} />
                      </CollapsibleSection>
                    ))}
                  </Stack>
                </CollapsibleSection>
              ))}
            </Stack>
          </CollapsibleSection>
        ))}
      </Stack>

      <Divider />

      <LinhaTotal
        rotulo="Total cobrável (locatário)"
        valor={dados.totalCobravel}
        peso={700}
        cor={theme.category.orange}
      />
    </Stack>
  );
}
