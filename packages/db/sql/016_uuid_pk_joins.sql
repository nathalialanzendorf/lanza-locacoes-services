-- Política relacional: PK de entidade = UUID; joins só por PK/FK UUID.
-- CPF, placa e textos legados são colunas de exibição/busca — não chaves de join.

COMMENT ON SCHEMA lanza IS
  'Domínio Lanza Locações. Toda tabela de entidade usa id UUID PRIMARY KEY; '
  'relacionamentos usam *_id UUID REFERENCES …(id).';

COMMENT ON COLUMN lanza.contratos.veiculo_id IS 'FK UUID → lanza.veiculos.id (join por PK, não por placa).';
COMMENT ON COLUMN lanza.contratos.cliente_id IS 'FK UUID → lanza.clientes.id (join por PK, não por CPF).';
COMMENT ON COLUMN lanza.cliente_despesas.veiculo_id IS 'FK UUID → lanza.veiculos.id';
COMMENT ON COLUMN lanza.cliente_despesas.condutor_id IS 'FK UUID → lanza.clientes.id';
COMMENT ON COLUMN lanza.infracoes.veiculo_id IS 'FK UUID → lanza.veiculos.id';
COMMENT ON COLUMN lanza.infracoes.condutor_id IS 'FK UUID → lanza.clientes.id';
COMMENT ON COLUMN lanza.locacoes.veiculo_id IS 'FK UUID → lanza.veiculos.id';
COMMENT ON COLUMN lanza.locacoes.cliente_id IS 'FK UUID → lanza.clientes.id';
COMMENT ON COLUMN lanza.parceiro_despesas.veiculo_id IS 'FK UUID → lanza.veiculos.id';
