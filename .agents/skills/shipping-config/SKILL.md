---
name: shipping-config
description: Configuracao de frete dos Correios do Garimpo da Moda. Use esta skill para consultar, atualizar ou dar manutencao nas faixas de caixas, pesos e integracao com Correios.
metadata:
  author: Garimpo da Moda
  version: "1.0.0"
  date: Abril 2026
---

# Configuracao de Frete - Garimpo da Moda

## Visao Geral

O frete e calculado via API SOAP dos Correios (PAC + SEDEX) usando caixas padrao selecionadas pela **quantidade de itens** no carrinho. A config existe em 2 lugares que devem estar sincronizados:

| Local | Arquivo | Funcao |
|-------|---------|--------|
| **Frontend** | `app.js` (constante `SHIPPING_CONFIG`, topo do arquivo) | Calcula dimensoes/peso para consulta de frete |
| **Backend** | `supabase/functions/create-mp-payment/index.ts` (constante `SHIP_BOXES`) | Valida frete no servidor antes de cobrar |

**IMPORTANTE:** Ao alterar a config em um, atualizar o outro tambem.

## CEP de Origem

**29937-400** (fixo, hardcoded em ambos os arquivos e no `get-shipping-quote`)

Para mudar, atualizar em 3 lugares:
1. `app.js` → `SHIPPING_CONFIG.cepOrigem`
2. `supabase/functions/get-shipping-quote/index.ts` → `cepOrigem`
3. `supabase/functions/create-mp-payment/index.ts` → `cepOrigem`

## Tabela de Caixas Atual

| Caixa | Max Itens | Dimensoes (C x L x A) | Peso Embalagem |
|-------|-----------|----------------------|----------------|
| PP | 2 | 20 x 15 x 5 cm | 0.15 kg |
| P | 4 | 25 x 20 x 7 cm | 0.15 kg |
| M | 6 | 30 x 22 x 10 cm | 0.20 kg |
| G | 10 | 33.5 x 27 x 14 cm | 0.25 kg |
| GG | 999 (10+) | 40 x 30 x 15 cm | 0.30 kg |

## Peso por Peca

- **Padrao:** 0.50 kg por peca (conservador para roupas de bazar)
- Produtos podem ter campo `peso` individual no banco (tabela `produtos`). Se existir, usa o valor do produto; senao, usa o padrao.
- **Formula:** `peso_total = peso_embalagem + soma(peso_cada_peca)`
- **Minimo Correios:** 0.3 kg

## Como Alterar Faixas

### Exemplo: Adicionar caixa XGG para 15+ pecas

**No app.js** (`SHIPPING_CONFIG.boxes`):
```js
{ name: 'XGG', maxItems: 999, comprimento: 50, largura: 35, altura: 20, boxWeight: 0.40 },
```
Mude o `maxItems` da GG de 999 para 15 e adicione XGG com 999.

**No create-mp-payment** (`SHIP_BOXES`):
```ts
{ maxItems: 15,  c: 40,  l: 30, a: 15, boxWeight: 0.30 },
{ maxItems: 999, c: 50,  l: 35, a: 20, boxWeight: 0.40 },
```

### Exemplo: Mudar peso padrao para 0.40 kg

- `app.js` → `SHIPPING_CONFIG.defaultWeightPerItem: 0.40`
- `create-mp-payment/index.ts` → `const DEFAULT_WEIGHT = 0.40`

## Servicos dos Correios

| Servico | Codigo | Uso |
|---------|--------|-----|
| PAC | 03298 | Economico (mais barato, mais lento) |
| SEDEX | 03220 | Rapido (mais caro, 1-3 dias) |

Codigos configurados em `get-shipping-quote/index.ts` na URL da API.

## API dos Correios

- **Endpoint SOAP (legacy, sem contrato):** `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx`
- **Parametros:** nCdServico, sCepOrigem, sCepDestino, nVlPeso, nCdFormato (1=caixa), nVlComprimento, nVlAltura, nVlLargura
- **Minimos Correios:** comprimento >= 16cm, largura >= 11cm, altura >= 2cm
- **Resposta:** XML com tags Codigo, Valor, PrazoEntrega, Erro, MsgErro

## Fluxo do Frete no Checkout

1. Comprador abre checkout → frete **oculto**
2. Comprador digita CEP → `buscarCep()` auto-preenche endereco
3. `buscarFreteCorreios()` chama Edge Function `get-shipping-quote`
4. Opcoes PAC/SEDEX aparecem com precos e prazos
5. Comprador seleciona → total atualiza (subtotal + frete)
6. Ao pagar, `create-mp-payment` **recalcula** frete no servidor (seguranca)

## Arquivos Relacionados

| Arquivo | O que faz |
|---------|-----------|
| `app.js` | Config de caixas, calculo frontend, UX do checkout |
| `supabase/functions/get-shipping-quote/index.ts` | Consulta API Correios, retorna PAC + SEDEX |
| `supabase/functions/create-mp-payment/index.ts` | Validacao servidor do frete antes do pagamento |
| `style.css` | Estilos do seletor de frete (classes `.shipping-*`) |

## Troubleshooting

| Problema | Causa provavel | Solucao |
|----------|---------------|---------|
| Frete nao aparece | CEP invalido ou API Correios fora | Testar CEP manualmente, verificar logs da Edge Function |
| Valor diferente do esperado | Config desincronizada frontend/backend | Comparar `SHIPPING_CONFIG` com `SHIP_BOXES` |
| Erro "Nenhum servico disponivel" | CEP nao atendido por PAC/SEDEX | Normal para areas remotas, mostrar mensagem ao cliente |
| Frete R$ 30 fixo | Fallback ativado (API Correios falhou) | Verificar se Edge Function tem acesso a internet |

## Pesos de Referencia por Tipo de Peca

Para ajustar o peso padrao ou individual dos produtos:

| Tipo | Peso medio |
|------|-----------|
| Blusa/top | 0.20 kg |
| Vestido leve | 0.30 kg |
| Short/bermuda tecido leve | 0.25 kg |
| Short/bermuda jeans | 0.35 kg |
| Calca tecido leve | 0.35 kg |
| Calca jeans | 0.60 kg |
| Conjunto leve | 0.40 kg |
| Conjunto medio | 0.50 kg |
| Conjunto pesado (jeans) | 0.70 kg |
