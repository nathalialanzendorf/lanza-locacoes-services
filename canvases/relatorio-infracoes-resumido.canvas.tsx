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

const dados = {
  "titulo": "Relatório de infrações (resumido)",
  "geradoEmBr": "11/07/2026",
  "blocos": [
    {
      "id": "ativo",
      "titulo": "Contrato ativo",
      "qtd": 10,
      "total": 1498.04,
      "grupos": [
        {
          "titulo": "Juliano Foizer Silveira",
          "contratoPlaca": "OZC-0B50",
          "contratoMarcaModelo": "FORD/FOCUS SE 1.6 SEDAN GNV",
          "subtitulo": "Infrações em: IWP-5G63",
          "linhas": [
            {
              "auto": "P0drq000lm",
              "titulo": "ATRASADO Multa conversão - 09/06/2026 10:57",
              "descricao": "EXEC OPER DE CONVERSAO A ESQ EM LOCAL PROIBIDO PELA SINALIZ",
              "placa": "IWP-5G63",
              "data": "09/06/2026 10:57:32",
              "situacao": "Em aberto",
              "valor": 195.23
            }
          ],
          "total": 195.23
        },
        {
          "titulo": "Laryssa (Gustavo) Costa de Quadros",
          "contratoPlaca": "IYR-8F19",
          "contratoMarcaModelo": "PEUGEOT/2008 STYLE EAT6",
          "subtitulo": "Infrações em: OZC-0B50",
          "linhas": [
            {
              "auto": "J007356743",
              "titulo": "ATRASADO Multa velocidade - 02/03/2026 20:54",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "OZC-0B50",
              "data": "02/03/2026 20:54:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "J008779003",
              "titulo": "ATRASADO Multa velocidade - 09/05/2026 23:33",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "OZC-0B50",
              "data": "09/05/2026 23:33:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "J008779092",
              "titulo": "ATRASADO Multa velocidade - 09/05/2026 23:43",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "OZC-0B50",
              "data": "09/05/2026 23:43:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "J008779127",
              "titulo": "ATRASADO Multa trânsito - 09/05/2026 23:47",
              "descricao": "TRANS EM VELOC SUP À MÁX PERMITIDA EM MAIS DE 20% ATE 50%",
              "placa": "OZC-0B50",
              "data": "09/05/2026 23:47:00",
              "situacao": "Em aberto",
              "valor": 195.23
            }
          ],
          "total": 585.71
        },
        {
          "titulo": "Tiago Augusto da Silva Piareti",
          "contratoPlaca": "IXT-7I93",
          "contratoMarcaModelo": "RENAULT/SANDERO 1.0 Flex",
          "linhas": [
            {
              "auto": "P0cc2001ce",
              "titulo": "Multa parada - 02/04/2026 14:30 (Advertida)",
              "descricao": "PARAR NO PASSEIO",
              "placa": "IXT-7I93",
              "data": "02/04/2026 14:30:03",
              "situacao": "Advertida",
              "valor": 88.38
            },
            {
              "auto": "P0cc2001o0",
              "titulo": "Multa parada - 16/04/2026",
              "descricao": "PARAR EM LOCAL/HORÁRIO PROIBIDO ESPECIFICAM PELA SINALIZACAO",
              "placa": "IXT-7I93",
              "data": "16/04/2026 07:57:46",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "P0exe000ri",
              "titulo": "ATRASADO Multa celular - 27/05/2026 08:09",
              "descricao": "DIRIGIR VEICULO MANUSEANDO TELEFONE CELULAR",
              "placa": "IXT-7I93",
              "data": "27/05/2026 08:09:55",
              "situacao": "Em aberto",
              "valor": 293.47
            },
            {
              "auto": "P0exe000rn",
              "titulo": "ATRASADO Multa celular - 27/05/2026 08:30",
              "descricao": "DIRIGIR VEICULO MANUSEANDO TELEFONE CELULAR",
              "placa": "IXT-7I93",
              "data": "27/05/2026 08:30:11",
              "situacao": "Em aberto",
              "valor": 293.47
            }
          ],
          "total": 717.1
        },
        {
          "titulo": "Virginia Jose Caraballo Camacho",
          "contratoPlaca": "OWN-3C59",
          "contratoMarcaModelo": "RENAULT/SANDERO 1.0 Flex",
          "linhas": [
            {
              "auto": "N005035885",
              "titulo": "Multa alcoolemia (Paga)",
              "descricao": "RECUSAR SUBMETER TESTE/EX CLIN/PERIC/PROC FORMA ART 277CTB",
              "placa": "OWN-3C59",
              "data": "30/05/2026 00:22:00",
              "situacao": "Paga DETRAN",
              "valor": 2934.7
            }
          ],
          "total": 0
        }
      ]
    },
    {
      "id": "encerrado",
      "titulo": "Contrato encerrado",
      "qtd": 34,
      "total": 3059.94,
      "grupos": [
        {
          "titulo": "Alberto Jose Gonzalez Salazar",
          "contratoPlaca": "MLN-0B87",
          "contratoMarcaModelo": "FORD/FIESTA FLEX",
          "subtitulo": "Encerrado em 05/01/2026 — Devolvido",
          "linhas": [
            {
              "auto": "J005307158",
              "titulo": "Multa velocidade - 05/12/2025 17:06",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MLN-0B87",
              "data": "05/12/2025 17:06:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "P0det0005p",
              "titulo": "Multa estacionamento - 17/12/2025 11:30 (Paga)",
              "descricao": "ESTAC EM LOCAL/HORÁRIO PROIBIDO ESPECIFICAMENTE PELA SINALIZ",
              "placa": "MLN-0B87",
              "data": "17/12/2025 11:30:38",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            },
            {
              "auto": "P0det0005w",
              "titulo": "Multa estacionamento - 17/12/2025 13:07 (Paga)",
              "descricao": "ESTAC EM LOCAL/HORÁRIO PROIBIDO ESPECIFICAMENTE PELA SINALIZ",
              "placa": "MLN-0B87",
              "data": "17/12/2025 13:07:26",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            },
            {
              "auto": "C251001171",
              "titulo": "Multa farol - 29/12/2025 14:38 (Paga)",
              "descricao": "EM MOVIM DE DIA, DEIX DE MANT ACESA LUZ BAIXA SOB CHuv, nebl",
              "placa": "MLN-0B87",
              "data": "29/12/2025 14:38:59",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            }
          ],
          "total": 130.16
        },
        {
          "titulo": "Arlem Eduardo Preira Rodriguez",
          "contratoPlaca": "QJB-0I83",
          "contratoMarcaModelo": "VW/FOX CONNECT MB GNV",
          "subtitulo": "Infrações em: IWP-5G63 · Encerrado em 26/06/2026 — Devolvido",
          "linhas": [
            {
              "auto": "J008087450",
              "titulo": "Multa velocidade - 10/04/2026",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "IWP-5G63",
              "data": "10/04/2026 05:23:00",
              "situacao": "Em aberto",
              "valor": 130.16
            }
          ],
          "total": 130.16
        },
        {
          "titulo": "Cristiane dos Santos",
          "contratoPlaca": "MLN-0B87",
          "contratoMarcaModelo": "FORD/FIESTA FLEX",
          "subtitulo": "Infrações em: MLW-7I09 · Encerrado em 10/04/2025 — Devolvido",
          "linhas": [
            {
              "auto": "0000556415",
              "titulo": "Multa sinal - 05/01/2025 02:50",
              "descricao": "AVANÇAR SINAL VERM, EXC OND. PERM LIVR CONV A DIR - Fisc Ele",
              "placa": "MLW-7I09",
              "data": "05/01/2025 02:50:58",
              "situacao": "Em aberto",
              "valor": 293.47
            }
          ],
          "total": 293.47
        },
        {
          "titulo": "Djair Cardoso Fernandes",
          "contratoPlaca": "MKV-6268",
          "contratoMarcaModelo": "HYUNDAI/HB20 1.0 M",
          "subtitulo": "Sem contrato ativo",
          "linhas": [
            {
              "auto": "J001367949",
              "titulo": "Multa velocidade - 04/04/2025 23:15",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MKV-6268",
              "data": "04/04/2025 23:15:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "J001435693",
              "titulo": "Multa velocidade - 14/04/2025 00:20",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MKV-6268",
              "data": "14/04/2025 00:20:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "S046265908",
              "titulo": "Multa velocidade - 15/07/2025 23:17",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MKV-6268",
              "data": "15/07/2025 23:17:00",
              "situacao": "Em aberto",
              "valor": 130.16
            }
          ],
          "total": 390.48
        },
        {
          "titulo": "Edson de Souza Boeno",
          "subtitulo": "Sem contrato ativo",
          "linhas": [
            {
              "auto": "J001031460",
              "titulo": "Multa velocidade - 26/02/2025 13:49",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MKV-6268",
              "data": "26/02/2025 13:49:00",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "J000973494",
              "titulo": "Multa velocidade - 26/02/2025 15:03",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MKV-6268",
              "data": "26/02/2025 15:03:00",
              "situacao": "Em aberto",
              "valor": 130.16
            }
          ],
          "total": 260.32
        },
        {
          "titulo": "Gabriel Ramos De Oliveira",
          "contratoPlaca": "MLN-0B87",
          "contratoMarcaModelo": "FORD/FIESTA FLEX",
          "subtitulo": "Sem contrato ativo",
          "linhas": [
            {
              "auto": "P0CA1000LF",
              "titulo": "Multa celular (Paga)",
              "descricao": "DIRIGIR VEICULO MANUSEANDO TELEFONE CELULAR",
              "placa": "MLN-0B87",
              "data": "31/05/2025 15:25:28",
              "situacao": "Paga DETRAN",
              "valor": 293.47
            }
          ],
          "total": 0
        },
        {
          "titulo": "Hamza Issa Mohammad Smreen",
          "contratoPlaca": "QJB-0I83",
          "contratoMarcaModelo": "VW/FOX CONNECT MB GNV",
          "subtitulo": "Sem contrato ativo",
          "linhas": [
            {
              "auto": "J000866453",
              "titulo": "Multa velocidade (Paga)",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "QJB-0I83",
              "data": "05/02/2025 23:16:00",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            },
            {
              "auto": "J000877352",
              "titulo": "Multa velocidade (Paga)",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "QJB-0I83",
              "data": "07/02/2025 01:16:00",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            }
          ],
          "total": 0
        },
        {
          "titulo": "JAVIER ALEXANDER DURAN CARRERO",
          "contratoPlaca": "MLN-0B87",
          "contratoMarcaModelo": "FORD/FIESTA FLEX",
          "subtitulo": "Sem contrato ativo",
          "linhas": [
            {
              "auto": "8779I37319",
              "titulo": "Multa velocidade - 06/09/2025 14:45 (Paga)",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MLN-0B87",
              "data": "06/09/2025 14:45:36",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            }
          ],
          "total": 0
        },
        {
          "titulo": "Lucas da Silva Dimas",
          "contratoPlaca": "MKV-6268",
          "contratoMarcaModelo": "HYUNDAI/HB20 1.0 M",
          "subtitulo": "Encerrado em 04/05/2026 — Recuperado",
          "linhas": [
            {
              "auto": "CRC0828221",
              "titulo": "Multa velocidade - 08/02/2026 (Paga)",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MKV-6268",
              "data": "08/02/2026 13:09:02",
              "situacao": "Paga Lanza",
              "valor": 130.16
            },
            {
              "auto": "P0drp000er",
              "titulo": "Multa farol - 22/04/2026 (Paga)",
              "descricao": "EM MOVIMENTO, DEIXAR DE MANTER ACESA A LUZ BAIXA A NOITE",
              "placa": "MKV-6268",
              "data": "22/04/2026 20:14:27",
              "situacao": "Paga Lanza",
              "valor": 130.16
            }
          ],
          "total": 0
        },
        {
          "titulo": "Luiz Marcelo Porto Menezes Moreira",
          "contratoPlaca": "QJB-0I83",
          "contratoMarcaModelo": "VW/FOX CONNECT MB GNV",
          "subtitulo": "Encerrado em 18/05/2026 — Devolvido",
          "linhas": [
            {
              "auto": "P0det000ge",
              "titulo": "Multa estacionamento (Paga)",
              "descricao": "ESTAC EM DESACOR C/ REGULAMENT ESPECIFICADA PELA SINALIZACAO",
              "placa": "QJB-0I83",
              "data": "27/02/2026 09:42:16",
              "situacao": "Paga DETRAN",
              "valor": 195.23
            },
            {
              "auto": "P0cc2001pu",
              "titulo": "Multa estacionamento - 16/04/2026 (Advertida)",
              "descricao": "ESTAC PONTO DE EMBAR/DESEMB DE PASSAGEIROS TRANSP COLETiVO",
              "placa": "QJB-0I83",
              "data": "16/04/2026 13:58:28",
              "situacao": "Advertida",
              "valor": 130.16
            },
            {
              "auto": "P0cc2001yr",
              "titulo": "Multa estacionamento - 29/04/2026",
              "descricao": "ESTAC EM DESACOR C/ REGULAMENTAÇÃO - PONTO OU VAGA DE TAXI",
              "placa": "QJB-0I83",
              "data": "29/04/2026 08:13:58",
              "situacao": "Em aberto",
              "valor": 195.23
            },
            {
              "auto": "P0dxg00170",
              "titulo": "Multa cinto - 10/05/2026",
              "descricao": "DEIXAR O CONDUTOR DE USAR O CINTO SEGURANÇA",
              "placa": "QJB-0I83",
              "data": "10/05/2026 16:44:30",
              "situacao": "Em aberto",
              "valor": 195.23
            },
            {
              "auto": "P0exe000fc",
              "titulo": "Multa estacionamento - 14/05/2026",
              "descricao": "ESTAC EM DESACOR C/ REGULAMENT ESPECIFICADA PELA SINALIZACAO",
              "placa": "QJB-0I83",
              "data": "14/05/2026 09:16:42",
              "situacao": "Em aberto",
              "valor": 195.23
            }
          ],
          "total": 585.69
        },
        {
          "titulo": "MATHEUS OSMAN PEREIRA DE QUADROS",
          "contratoPlaca": "BBV-6A91",
          "contratoMarcaModelo": "VW/NOVO GOL TL MBV",
          "subtitulo": "Sem contrato ativo",
          "linhas": [
            {
              "auto": "CRC0697711",
              "titulo": "Multa parada (Paga)",
              "descricao": "PARAR SOBRE FAIXA DE PEDESTRE MUDANÇA SINAL LUMINOSO-ELETRON",
              "placa": "BBV-6A91",
              "data": "22/06/2025 11:52:28",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            }
          ],
          "total": 0
        },
        {
          "titulo": "MIKAEL SCHMIDT",
          "contratoPlaca": "MLW-7I09",
          "contratoMarcaModelo": "HYUNDAI/HB20 1.0M COMFOR",
          "subtitulo": "Encerrado em 25/08/2025 — Recuperado",
          "linhas": [
            {
              "auto": "J002969750",
              "titulo": "Multa trânsito - 23/07/2025 17:22",
              "descricao": "TRANS EM VELOC SUP À MÁX PERMITIDA EM MAIS DE 20% ATE 50%",
              "placa": "MLW-7I09",
              "data": "23/07/2025 17:22:00",
              "situacao": "Em aberto",
              "valor": 195.23
            },
            {
              "auto": "J002807177",
              "titulo": "Multa velocidade - 24/07/2025 00:21",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MLW-7I09",
              "data": "24/07/2025 00:21:00",
              "situacao": "Em aberto",
              "valor": 130.16
            }
          ],
          "total": 325.39
        },
        {
          "titulo": "Noe de Oliveira Junior",
          "contratoPlaca": "OWN-3259",
          "contratoMarcaModelo": "SANDERO",
          "subtitulo": "Infrações em: MLX-2H34 · Encerrado em 19/01/2026 — Devolvido",
          "linhas": [
            {
              "auto": "6RA2144416",
              "titulo": "Multa rodízio (Paga)",
              "descricao": "TRANSITAR EM LOCAL/HORÁRIO NAO PERMITIDO REGULAMENT-RODIZIO",
              "placa": "MLX-2H34",
              "data": "02/12/2025 19:16:00",
              "situacao": "Paga DETRAN",
              "valor": 130.16
            }
          ],
          "total": 0
        },
        {
          "titulo": "Rafael Moreira Pontel",
          "contratoPlaca": "OWN-3259",
          "contratoMarcaModelo": "SANDERO",
          "subtitulo": "Infrações em: BBV-6A91, MLN-0B87 · Sem contrato ativo",
          "linhas": [
            {
              "auto": "J001208390",
              "titulo": "Multa velocidade (Justificada)",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "BBV-6A91",
              "data": "17/03/2025 22:44:00",
              "situacao": "Justificada",
              "valor": 130.16
            },
            {
              "auto": "P0cc20016c",
              "titulo": "Multa parada - 18/05/2026 (Paga)",
              "descricao": "PARAR EM LOCAL/HORÁRIO PROIBIDO ESPECIFICAM PELA SINALIZACAO",
              "placa": "MLN-0B87",
              "data": "30/03/2026 09:40:08",
              "situacao": "Paga Lanza",
              "valor": 130.16
            }
          ],
          "total": 0
        },
        {
          "titulo": "Renan Peters da Silva",
          "contratoPlaca": "BBV-6A91",
          "contratoMarcaModelo": "VW/NOVO GOL TL MBV",
          "subtitulo": "Encerrado em 14/01/2026 — Devolvido",
          "linhas": [
            {
              "auto": "J005833081",
              "titulo": "Multa velocidade - 26/12/2025 05:37",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "BBV-6A91",
              "data": "26/12/2025 05:37:00",
              "situacao": "Em aberto",
              "valor": 130.16
            }
          ],
          "total": 130.16
        },
        {
          "titulo": "Susana da Silva",
          "contratoPlaca": "BBV-6A91",
          "contratoMarcaModelo": "VW/NOVO GOL TL MBV",
          "subtitulo": "Encerrado em 26/06/2026 — Devolvido",
          "linhas": [
            {
              "auto": "CRC0883952",
              "titulo": "Multa velocidade - 12/05/2026",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "BBV-6A91",
              "data": "12/05/2026 17:39:10",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "CRC0890597",
              "titulo": "Multa sinal - 02/06/2026",
              "descricao": "AVANÇAR SINAL VERM, EXC OND. PERM LIVR CONV A DIR - Fisc Ele",
              "placa": "BBV-6A91",
              "data": "02/06/2026 20:00:44",
              "situacao": "Em aberto",
              "valor": 293.47
            }
          ],
          "total": 423.63
        },
        {
          "titulo": "Victor Alisson Azevedo Muniz",
          "contratoPlaca": "MLW-7I09",
          "contratoMarcaModelo": "HYUNDAI/HB20 1.0M COMFOR",
          "subtitulo": "Encerrado em 30/06/2026 — Devolvido",
          "linhas": [
            {
              "auto": "CRC0824305",
              "titulo": "Multa velocidade - 28/01/2026 08:57",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MLW-7I09",
              "data": "28/01/2026 08:57:31",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "CRC0850575",
              "titulo": "Multa velocidade - 29/03/2026 01:08",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MLW-7I09",
              "data": "29/03/2026 01:08:34",
              "situacao": "Em aberto",
              "valor": 130.16
            },
            {
              "auto": "CRC0862752",
              "titulo": "Multa velocidade - 03/04/2026 06:25",
              "descricao": "TRANSITAR EM VEL SUPERIOR À MÁXIMA PERMITIDA EM ATÉ 20%",
              "placa": "MLW-7I09",
              "data": "03/04/2026 06:25:30",
              "situacao": "Em aberto",
              "valor": 130.16
            }
          ],
          "total": 390.48
        }
      ]
    }
  ],
  "totalGeral": 4557.98
} as {
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

export default function RelatorioInfracoesResumido() {
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
