import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// A sua Chave Dev atual do AbacatePay! (Em ambiente final o ideal é ser configurada dentro do painel do Supabase como Secrets Vault)
const ABACATEPAY_KEY = Deno.env.get('ABACATEPAY_KEY') || 'abc_dev_cYubUxyRrQb0P650GpxcydqB';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Trata a requisição CORS para o navegador não bloquear
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Configura o banco na nuvem
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const reqData = await req.json()
    const { idProduto, pedidoId, titulo, precoCents } = reqData

    // 1. Bloqueia a roupa no banco de dados
    const { error: dbError } = await supabaseClient
      .from('produtos')
      .update({ disponivel: false })
      .eq('id', idProduto);

    if (dbError) throw new Error('Falha ao reservar estoque do item: ' + dbError.message);

    // 2. Aciona o AbacatePay via API privada
    const abacateReq = await fetch('https://api.abacatepay.com/v1/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ABACATEPAY_KEY}`
      },
      body: JSON.stringify({
        frequency: "ONE_TIME",
        methods: ["PIX", "CREDIT_CARD"],
        products: [
          {
            externalId: String(idProduto),
            name: titulo,
            description: "Garimpo da Moda - Peça Única Exclusiva",
            quantity: 1,
            price: precoCents // O AbacatePay opera calculando centavos. Ex: 89.90 vira 8990
          }
        ],
        returnUrl: "https://seu-github-pages-quando-tiver.com/sucesso",
        completionUrl: "https://seu-github-pages-quando-tiver.com/sucesso"
      })
    });

    const abacateRes = await abacateReq.json()
    console.log("Retorno do AbacatePay:", abacateRes)
    
    // Trata a resposta assumindo o padrão da API.
    const paymentUrl = abacateRes.data?.url || abacateRes.url;

    if (!paymentUrl) {
         throw new Error("AbacatePay não retornou uma URL válida.");
    }
    
    // Atualiza o pedido gerado com a url de cobrança
    await supabaseClient.from('pedidos').update({ link_pagamento: paymentUrl }).eq('id', pedidoId);

    // Retorna a URL para o site Github Pages
    return new Response(JSON.stringify({ paymentUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
