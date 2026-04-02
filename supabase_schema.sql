-- Tabela de Clientes
CREATE TABLE clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  instagram TEXT NOT NULL,
  endereco TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Produtos (Vitrine das peças únicas)
CREATE TABLE produtos (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  preco DECIMAL(10, 2) NOT NULL,
  imagem_url TEXT,
  disponivel BOOLEAN DEFAULT true, -- Fundamental: Torna falso após iniciar a compra
  tamanho TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Pedidos
CREATE TABLE pedidos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id),
  produto_id BIGINT REFERENCES produtos(id),
  status_pagamento TEXT DEFAULT 'pendente', -- pendente, pago, cancelado
  link_pagamento TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS (Segurança Mínima: Cliente só vê a vitrine)
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Qualquer pessoa pode listar o estoque" ON produtos FOR SELECT USING (true);

-- ATENÇÃO: As políticas de INSERT para pedidos e clientes seriam configuradas a partir da API.

-- Inserindo Produtos Fictícios Gerados (Para o Teste Inicial)
INSERT INTO produtos (titulo, descricao, preco, imagem_url, disponivel, tamanho) VALUES
('Blazer Vintage Anos 90', 'Blazer em lã pura de alfaiataria importada. Peça única e exclusiva.', 129.90, 'img/blazer.png', true, 'P'),
('Vestido de Festa Seda', 'Fluido e muito elegante na cor rosa blush. Ideal para final de semana.', 189.90, 'img/vestido.png', true, 'M'),
('Calça de Alfaiataria Nude', 'Corte reto, cintura super alta. Valoriza demais a silhueta.', 89.90, 'img/calca.png', true, 'G');
