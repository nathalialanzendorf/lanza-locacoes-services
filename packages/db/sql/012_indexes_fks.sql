-- Índices compostos adicionais e FKs adiadas (idempotente).

CREATE INDEX IF NOT EXISTS contratos_cliente_status_idx ON lanza.contratos (cliente_id, status);
CREATE INDEX IF NOT EXISTS cliente_despesas_condutor_paga_idx ON lanza.cliente_despesas (condutor_id, paga) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS infracoes_veiculo_ativo_idx ON lanza.infracoes (veiculo_placa, ativo);
CREATE INDEX IF NOT EXISTS locacoes_veiculo_inicio_idx ON lanza.locacoes (veiculo_id, inicio);
