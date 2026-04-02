# Contexto do Projeto: Garimpo da Moda (Brechó Exclusivo)

Este documento contém todo o histórico, as chaves, arquitetura e os problemas enfrentados no deploy do Garimpo da Moda, documentado para continuidade por outros modelos/agentes (como o Claude Code).

## 1. Visão Geral e Arquitetura
- **Frontend:** Vanilla HTML, CSS3 e JavaScript (`app.js`).
- **Hospedagem:** GitHub Pages (`https://fabianocoutop.github.io/garimpodamoda/`).
- **Backend:** Supabase (Projeto `rjjbxpssymaauqzpooig`).
- **Pagamento:** AbacatePay (integrada via Edge Functions do Supabase por segurança).

## 2. Acesso e Chaves (⚠️ Ambiente Atual)
- **Supabase URL:** `https://rjjbxpssymaauqzpooig.supabase.co`
- **Modern Publishable Key (Ignorada):** `sb_publishable_hHYVuolaT64VJjQAORY3Vw_2lNdNV7p`
- **Legacy Anon JWT (Ativa no `app.js`):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqamJ4cHNzeW1hYXVxenBvb2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQzMDcsImV4cCI6MjA5MDc0MDMwN30.595t4Df-jcn2JkZhKWVgb5E7pOjv2hj7_5eAba3PidQ`
- **AbacatePay DEV Key:** `abc_dev_cYubUxyRrQb0P650GpxcydqB` (Foi removida do Deno/Edge Function publicamente para não vazar no GitHub; exigida via variável de ambiente `ABACATEPAY_KEY`).

## 3. Estrutura do Banco de Dados (Supabase)
Tabelas:
- **`produtos`** (id, titulo, descricao, preco, disponivel, img_url)
- **`clientes`** (id UUID, nome, instagram, endereco)
- **`pedidos`** (id BIGSERIAL, cliente_id, produto_id, status_pagamento)

**Políticas RLS Atuais:**
- `produtos`: Liberado para LEITURA (Select) pública - `USING (true)`.
- `clientes` e `pedidos`: Permitido INSERÇÃO por `anon` - `WITH CHECK (true)`.

## 4. O Problema e o Erro Enfrentado
O usuário relata que, ao preencher os dados de entrega em `index.html` e clicar em **"Ir para Pagamento (AbacatePay)"**, a tela não avança e mostra a mensagem de erro genérica em vermelho:
`Ocorreu um erro interno na loja. Tente novamente mais tarde.`

### Histórico da Investigação:
1. **Erro 401 Unauthorized:** O Supabase Javascript Client estava falhando ao se conectar com a base porque testamos inicialmente com a chave `sb_publishable_...`. Atualizamos o `app.js` para usar o `Legacy Anon JWT`, o que resolveria as negativas do PostgREST.
2. **Erro de RLS Violado no frontend:** O código Javascript original fazia:
   `from('clientes').insert(...).select()`
   Como a tabela de clientes tem política anônima apenas para `INSERT`, a tentativa de encadear `.select()` do registro recém criado falhava ou retornava nulo, quebrando a leitura posterior `res.data[0].id` no próprio JS, resultando novamente no erro capturado.
3. **Solução Criada (Procedure):**
   Criamos uma SQL Procedure (RPC) no banco chamada `fechar_pedido`.
   ```sql
   CREATE OR REPLACE FUNCTION fechar_pedido(p_nome TEXT, p_instagram TEXT, p_endereco TEXT, p_produto_id BIGINT)
   RETURNS BIGINT
   LANGUAGE plpgsql
   SECURITY DEFINER
   AS $$
   DECLARE
     v_cliente_id UUID;
     v_pedido_id BIGINT;
   BEGIN
     INSERT INTO clientes (nome, instagram, endereco) VALUES (p_nome, p_instagram, p_endereco) RETURNING id INTO v_cliente_id;
     INSERT INTO pedidos (cliente_id, produto_id, status_pagamento) VALUES (v_cliente_id, p_produto_id, 'pendente') RETURNING id INTO v_pedido_id;
     RETURN v_pedido_id;
   END;
   $$;

   -- E garantimos execução pública:
   GRANT EXECUTE ON FUNCTION public.fechar_pedido(TEXT, TEXT, TEXT, BIGINT) TO anon;
   ```
4. **Atualização do Frontend:** O `app.js` foi editado para abandonar o processamento em etapas e adotar o RPC `_supabase.rpc('fechar_pedido', { ... })`. Atualizamos o Github adicionando o parâmetro querystring `?v=2` na importação do HTML (`<script src="app.js?v=2"></script>`) para matar o cache.

## 5. Diretriz para o Claude Code (O que fazer)
Mesmo após todo esse esforço de cache-bust, o front-end *ainda* se esbarra na tela de erro e se recusa a ir para a URL de pagamento.
Por favor, analise através destas ações:
1. Avaliar minuciosamente a tag `<script src="app.js">` e se a versão atualizada está baixando direito no deploy vivo.
2. Ler todo o bloco da função `processarPedido(event)` do último `app.js` e verificar se há **Exceções Sintáticas/Undefined** atiradas silenciosamente antes ou depois da chamada RPC, ou no encadeamento dos blocos `try/catch`. 
3. Verificar a Edge Function chamada `create-payment-link` do Supabase. A função usa a variável secreta de ambiente `ABACATEPAY_KEY`. Analise se a Edge Function está quebrando e devolvendo erro 500 pela ausência do secret (já que a chave foi retirada hardcoded por motivos de segurança). Caso sim, será necessário configurar o token pelo Deno / Supabase CLI. 

Repositório Github: `https://github.com/fabianocoutop/garimpodamoda`!
Boa sorte!
