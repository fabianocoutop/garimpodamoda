# Contexto do Projeto: Garimpo da Moda (Bazar Exclusivo)

Este documento contém todo o histórico, as chaves, arquitetura e os problemas enfrentados no deploy do Garimpo da Moda, documentado para continuidade por outros modelos/agentes (como o Claude Code).

## 1. Visão Geral e Arquitetura
- **Frontend:** Vanilla HTML, CSS3 e JavaScript (`app.js`).
- **Hospedagem:** GitHub Pages (`https://fabianocoutop.github.io/garimpodamoda/`).
- **Backend:** Supabase (Projeto `rjjbxpssymaauqzpooig`).
- **Pagamento:** Atualmente em modo **MOCK** (Simulado). As integrações com Stripe e AbacatePay foram removidas.

## 2. Acesso e Chaves
- **Supabase URL:** `https://rjjbxpssymaauqzpooig.supabase.co`
- **Modern Publishable Key (Ignorada):** `sb_publishable_hHYVuolaT64VJjQAORY3Vw_2lNdNV7p`
- **Legacy Anon JWT (Ativa no `app.js`):** `eyJ...` (Chave encriptada no app.js)

## 3. Estrutura do Banco de Dados (Supabase)
Tabelas mantidas para registros futuros:
- **`produtos`**: id, titulo, descricao, preco, disponivel, img_url.
- **`clientes`**: id UUID, nome, instagram, endereco.
- **`pedidos`**: id BIGSERIAL, cliente_id, produto_id, status_pagamento.

## 4. Histórico de Evolução
O projeto passou por tentativas de integração com AbacatePay e Stripe. Devido a limitações de aprovação de conta e requisitos técnicos para PIX (Stripe), decidiu-se por **remover as integrações** temporariamente.

### Estado Atual:
1. **Modo Mock:** O checkout no `app.js` apenas simula uma reserva e exibe um alerta.
2. **Integrações Removidas:** Stripe e AbacatePay não estão mais ativos no frontend.
3. **Plano Futuro:** Avaliar integração com **Mercado Pago** ou **InfinitePay**.

## 5. Diretriz para Manutenção
1. **Cache-Bust:** Sempre que alterar o `app.js`, atualize a versão na querystring no `index.html`.
2. **Volta ao Real:** Para reativar o fluxo real, a lógica de RPC `fechar_pedido` e as chamadas de Edge Functions devem ser restauradas no `app.js`.

Repositório Github: `https://github.com/fabianocoutop/garimpodamoda`!
