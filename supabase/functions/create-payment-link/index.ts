import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// A sua Chave de Produção será lida do Cofre do Supabase (Secrets Vault), garantindo total criptografia!
const ABACATEPAY_KEY = Deno.env.get('ABACATEPAY_KEY');
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
    // Configura o banco na nuvem usando SERVICE_ROLE (Poderes completos de Administrador) para poder baixar estoque
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const reqData = await req.json()
    const { idProduto, pedidoId, titulo, precoCents } = reqData

    // 1. Bloqueia a roupa no banco de dados
    const { error: dbError } = await supabaseClient
      .from('produtos')
      .update({ disponivel: false })
      .eq('id', idProduto);

    if (dbError) throw new Error('Falha ao reservar estoque do item: ' + dbError.message);

    // 1.5. Recupera os dados REAIS do Cliente salvos via RPC
    const { data: pedidoData, error: dbPedidoError } = await supabaseClient
      .from('pedidos')
      .select('clientes(*)')
      .eq('id', pedidoId)
      .single();

    if (dbPedidoError || !pedidoData || !pedidoData.clientes) {
       throw new Error('Falha ao buscar dados do cliente vinculado ao pedido.');
    }
    
    const cliente = pedidoData.clientes;

    // 2. Cria o Cliente Oficial no AbacatePay (Baseado no form do site)
    const customerReq = await fetch('https://api.abacatepay.com/v1/customer/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ABACATEPAY_KEY}`
      },
      body: JSON.stringify({
        name: cliente.nome,
        email: cliente.email,
        taxId: cliente.cpf,
        cellphone: cliente.telefone.replace(/\D/g, '') // Remove ( ) - para a API
      })
    });
    
    const customerRes = await customerReq.json();
    if (!customerRes.data || !customerRes.data.id) {
       throw new Error('Falha ao gerar o Cliente no AbacatePay: ' + JSON.stringify(customerRes));
    }
    const dynamicCustomerId = customerRes.data.id;

    // 3. Aciona o AbacatePay via API privada gerando a fatura
    const abacateReq = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ABACATEPAY_KEY}`
      },
      body: JSON.stringify({
        frequency: "ONE_TIME",
        methods: ["PIX"],
        products: [
          {
            externalId: `prod_${idProduto}_${Date.now()}`,
            name: titulo,
            description: "Garimpo da Moda - Peça Única Exclusiva",
            quantity: 1,
            price: precoCents
          }
        ],
        returnUrl: "https://fabianocoutop.github.io/garimpodamoda/",
        completionUrl: "https://fabianocoutop.github.io/garimpodamoda/",
        customerId: dynamicCustomerId // CLIENTE DINÂMICO
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
