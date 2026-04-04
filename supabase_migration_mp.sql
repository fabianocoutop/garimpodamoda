-- ================================================
-- MIGRAÇÃO: Integração Mercado Pago
-- Rodar no Supabase SQL Editor
-- ================================================

-- 1. Expandir tabela clientes com campos do formulário
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS rua TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado TEXT;

-- 2. Expandir tabela pedidos para Mercado Pago
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS valor_total DECIMAL(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mp_status TEXT;

-- 3. Criar tabela pedido_itens (carrinho multi-item)
CREATE TABLE IF NOT EXISTS pedido_itens (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id BIGINT REFERENCES produtos(id),
  preco_unitario DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS
ALTER TABLE pedido_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access pedido_itens" ON pedido_itens FOR ALL USING (true);

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon pode ler pedido por id" ON pedidos;
CREATE POLICY "Anon pode ler pedido por id" ON pedidos FOR SELECT USING (true);
CREATE POLICY "Service role full access pedidos" ON pedidos FOR ALL USING (true);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access clientes" ON clientes FOR ALL USING (true);
