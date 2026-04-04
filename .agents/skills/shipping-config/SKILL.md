---
name: shipping-config
description: Configuracao completa de frete do Garimpo da Moda. Tabela de caixas, precos por regiao, APIs dos Correios, e como migrar para API real. Use para consultar, atualizar ou dar manutencao no frete.
metadata:
  author: Garimpo da Moda
  version: "2.0.0"
  date: Abril 2026
---

# Configuracao de Frete - Garimpo da Moda

## Visao Geral

O frete usa **calculo local por tabela de precos por regiao** (baseado nos 2 primeiros digitos do CEP). A API SOAP antiga dos Correios foi descontinuada e a nova requer contrato. O calculo e instantaneo, sem dependencia de API externa.

A config existe em **2 arquivos que devem estar sincronizados**:

| Local | Arquivo | Constantes |
|-------|---------|------------|
| **Frontend** | `app.js` | `SHIPPING_CONFIG` (boxes + regions) |
| **Backend** | `supabase/functions/create-mp-payment/index.ts` | `SHIP_BOXES` + `REGIONS` |

**IMPORTANTE:** Ao alterar precos, caixas ou regioes em um, atualizar o outro tambem.

## Estado Atual da Implementacao

- **Metodo ativo:** Tabela local de precos por regiao (sem API externa)
- **Funcao frontend:** `calcularFreteLocal(cep)` em `app.js`
- **Validacao backend:** `create-mp-payment` recalcula com mesma tabela
- **Edge Function `get-shipping-quote`:** Existe mas usa API SOAP descontinuada — NAO esta em uso ativo
- **Fluxo:** CEP digitado → calculo instantaneo → PAC/SEDEX exibidos → usuario seleciona → total atualiza

## CEP de Origem

**29937-400** (Sao Mateus/ES)

Para mudar, atualizar em:
1. `app.js` → `SHIPPING_CONFIG.cepOrigem`
2. `supabase/functions/create-mp-payment/index.ts` → dentro da logica de frete (se usado)

---

## Tabela de Caixas (por quantidade de itens)

| Caixa | Max Itens | Dimensoes (C x L x A) | Peso Embalagem |
|-------|-----------|----------------------|----------------|
| PP | 2 | 20 x 15 x 5 cm | 0.15 kg |
| P | 4 | 25 x 20 x 7 cm | 0.15 kg |
| M | 6 | 30 x 22 x 10 cm | 0.20 kg |
| G | 10 | 33.5 x 27 x 14 cm | 0.25 kg |
| GG | 999 (10+) | 40 x 30 x 15 cm | 0.30 kg |

## Tabela de Precos por Regiao

Precos baseados nas tabelas oficiais dos Correios 2026, arredondados para cima.
`base` = preco ate 1kg | `perKgExtra` = adicional por kg excedente

| Regiao | Prefixos CEP | PAC base | PAC/kg+ | PAC prazo | SEDEX base | SEDEX/kg+ | SEDEX prazo |
|--------|-------------|----------|---------|-----------|------------|-----------|-------------|
| ES (local) | 29 | R$ 18 | +R$ 4 | 3 dias | R$ 25 | +R$ 6 | 1 dia |
| RJ/MG | 20-28, 30-39 | R$ 22 | +R$ 5 | 5 dias | R$ 32 | +R$ 7 | 2 dias |
| SP | 01-19 | R$ 24 | +R$ 5 | 6 dias | R$ 35 | +R$ 8 | 2 dias |
| BA/SE | 40-49 | R$ 25 | +R$ 6 | 7 dias | R$ 38 | +R$ 9 | 3 dias |
| PR/SC/RS | 80-99 | R$ 28 | +R$ 6 | 8 dias | R$ 42 | +R$ 9 | 3 dias |
| DF/GO/MS/MT | 70-79 | R$ 30 | +R$ 7 | 8 dias | R$ 45 | +R$ 10 | 3 dias |
| NE (demais) | 50-69 | R$ 32 | +R$ 7 | 10 dias | R$ 48 | +R$ 10 | 4 dias |
| Norte | fallback | R$ 38 | +R$ 9 | 12 dias | R$ 55 | +R$ 12 | 5 dias |

### Como o preco e calculado

```
kgExtra = max(0, ceil(pesoTotal) - 1)
preco = base + (kgExtra * perKgExtra)
```

Exemplo: 5 pecas para SP via PAC
- Caixa M (4-6 itens), peso embalagem 0.20kg
- Peso itens: 5 x 0.50kg = 2.50kg
- Peso total: 2.70kg → ceil = 3kg → kgExtra = 2
- Preco: R$ 24 + (2 x R$ 5) = **R$ 34**

## Peso por Peca

- **Padrao:** 0.50 kg por peca (conservador para roupas de bazar)
- Produtos podem ter campo `peso` individual no banco (tabela `produtos`). Se existir, usa o valor do produto; senao, usa o padrao.
- **Formula:** `peso_total = peso_embalagem + soma(peso_cada_peca)`
- **Minimo Correios:** 0.3 kg

---

## Como Alterar

### Alterar precos de uma regiao

**No app.js** (`SHIPPING_CONFIG.regions`), encontre a regiao e mude `base` e/ou `perKgExtra`:
```js
{ name: 'SP', prefixes: ['01',...,'19'], pac: { base: 26, perKgExtra: 6, prazo: 6 }, sedex: { base: 38, perKgExtra: 9, prazo: 2 } },
```

**No create-mp-payment** (`REGIONS`), mesma mudanca:
```ts
{ prefixes: ['01',...,'19'], pac: { base: 26, perKg: 6 }, sedex: { base: 38, perKg: 9 } },
```

### Adicionar caixa XGG para 15+ pecas

**No app.js** (`SHIPPING_CONFIG.boxes`):
Mude `maxItems` da GG de 999 para 15 e adicione:
```js
{ name: 'XGG', maxItems: 999, comprimento: 50, largura: 35, altura: 20, boxWeight: 0.40 },
```

**No create-mp-payment** (`SHIP_BOXES`):
```ts
{ maxItems: 15,  boxWeight: 0.30 },
{ maxItems: 999, boxWeight: 0.40 },
```

### Mudar peso padrao

- `app.js` → `SHIPPING_CONFIG.defaultWeightPerItem: 0.40`
- `create-mp-payment/index.ts` → `const DEFAULT_WEIGHT = 0.40`

---

## APIs dos Correios - Status e Opcoes

### API SOAP (Legacy) — FORA DO AR

- **Endpoint:** `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx`
- **Status em Abril/2026:** TIMEOUT completo (testado, nao conecta)
- **Nao requer contrato** mas esta descontinuada
- **Edge Function `get-shipping-quote`** ainda tem esse codigo mas NAO esta em uso
- Codigos de servico: PAC = 03298, SEDEX = 03220

### API REST Nova (CWS) — Requer Contrato

- **Endpoint producao:** `https://api.correios.com.br/preco/v1/nacional/{coProduto}`
- **Endpoint homologacao:** `https://apihom.correios.com.br/preco/v1/nacional/{coProduto}`
- **Autenticacao:** Bearer Token via `POST /token/v1/autentica/cartaopostagem`
- **Requisitos:**
  - CNPJ com contrato ativo nos Correios
  - Servico 38202 (API Precos) habilitado no contrato
  - Cartao de postagem vinculado
  - Token JWT obtido via "Meu Correios"
- **Documentacao oficial:** https://www.correios.com.br/atendimento/developers
- **Manual:** https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1
- **Parametros principais:**
  - `coProduto`: codigo do servico (03298=PAC, 03220=SEDEX)
  - `cepOrigem`, `cepDestino`
  - `psObjeto`: peso em gramas
  - `tpObjeto`: tipo (2=Pacote)
  - `comprimento`, `largura`, `altura` (para pacotes)
- **Resposta:** JSON com `pcFinal` (preco), `psCobrado` (peso cobrado), prazos

### CepCerto — Alternativa Paga

- **Endpoint:** `https://cepcerto.com/ws/json-frete/{cepOrigem}/{cepDestino}/{peso}/{altura}/{largura}/{comprimento}/{chave}`
- **Requisito:** Chave premium paga (assinar em cepcerto.com/plano-premium)
- **Contato:** fale@cepcerto.com | WhatsApp (17) 92000-4471
- **Vantagem:** Nao precisa de contrato Correios, usa dados reais dos Correios

### Melhor Envio — Alternativa com Cadastro

- **Endpoint:** `https://www.melhorenvio.com.br/api/v2/me/shipment/calculate`
- **Requisito:** Cadastro gratuito + token de autenticacao
- **Sandbox:** `https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate`
- **Vantagem:** Gratis, inclui tracking e geracao de etiquetas
- **Site:** melhorenvio.com.br

---

## Como Migrar para API Real

Quando tiver credenciais de qualquer uma das APIs acima, a mudanca e simples:

### No app.js

Substituir a funcao `calcularFreteLocal(cep)` por uma chamada async ao backend:

```js
// ANTES (tabela local):
function buscarFreteCorreios(cep) {
    const options = calcularFreteLocal(cep);
    renderizarOpcoesFrete(options);
}

// DEPOIS (API real via Edge Function):
async function buscarFreteCorreios(cep) {
    const dadosEnvio = calcularDadosEnvio();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-shipping-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ cep_destino: cep, peso: dadosEnvio.peso, comprimento: dadosEnvio.comprimento, largura: dadosEnvio.largura, altura: dadosEnvio.altura }),
    });
    const data = await response.json();
    if (data.success) renderizarOpcoesFrete(data.options);
}
```

### Na Edge Function `get-shipping-quote`

Trocar a chamada SOAP pela API escolhida (CWS, CepCerto ou Melhor Envio).

### Na Edge Function `create-mp-payment`

Trocar a tabela `REGIONS` por uma chamada a mesma API para validacao server-side.

---

## Fluxo do Frete no Checkout

1. Comprador abre checkout → frete **oculto** (container `display:none`)
2. Comprador digita CEP → `buscarCep()` auto-preenche endereco via ViaCEP
3. `buscarFreteCorreios(cep)` calcula frete localmente (instantaneo)
4. Container de frete aparece com opcoes PAC e SEDEX (preco + prazo)
5. Comprador seleciona opcao → `atualizarTotalCheckout()` atualiza subtotal + frete
6. Ao pagar, `create-mp-payment` **recalcula** frete no servidor com mesma tabela (seguranca)

## Arquivos Relacionados

| Arquivo | O que faz |
|---------|-----------|
| `app.js` | `SHIPPING_CONFIG` (caixas + regioes), `calcularDadosEnvio()`, `calcularFreteLocal()`, UX do checkout |
| `supabase/functions/create-mp-payment/index.ts` | `SHIP_BOXES` + `REGIONS`, validacao servidor |
| `supabase/functions/get-shipping-quote/index.ts` | API SOAP legacy (inativa), manter para futura migracao |
| `style.css` | Estilos do seletor de frete (classes `.shipping-*`) |

## Troubleshooting

| Problema | Causa provavel | Solucao |
|----------|---------------|---------|
| Frete nao aparece apos CEP | Container `#shipping-options-container` nao existe no DOM | Verificar se `abrirCheckoutDoCarrinho()` injeta o container |
| Spinner "Calculando..." preso | Funcao async sem timeout ou API externa down | Versao atual usa calculo local (nao deveria acontecer) |
| Valor diferente frontend/backend | Tabelas desincronizadas | Comparar `SHIPPING_CONFIG.regions` com `REGIONS` no backend |
| Frete R$ 30 fixo | Fallback no backend (CEP ou metodo nao informado) | Verificar se `shipping_method` e `cep_destino` chegam ao backend |
| CEP nao encontrado na tabela | Prefixo nao esta em nenhuma regiao | Cai no fallback "Norte" (ultima regiao, prefixes vazio) |

## Pesos de Referencia por Tipo de Peca

| Tipo | Peso medio |
|------|-----------|
| Blusa/top | 0.20 kg |
| Vestido leve | 0.30 kg |
| Short/bermuda tecido leve | 0.25 kg |
| Short/bermuda jeans | 0.35 kg |
| Calca tecido leve | 0.35 kg |
| Calca jeans | 0.60 kg |
| Conjunto leve (top + short/saia) | 0.40 kg |
| Conjunto medio (blusa + calca leve) | 0.50 kg |
| Conjunto pesado (jeans envolvido) | 0.70 kg |

**Padrao atual do sistema:** 0.50 kg (meio quilo por peca) — conservador e seguro para a maioria dos envios de bazar.
