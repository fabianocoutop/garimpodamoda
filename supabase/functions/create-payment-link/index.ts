import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Stripe from 'https://esm.sh/stripe@14.15.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const reqData = await req.json()
    const { idProduto, pedidoId, titulo, precoCents } = reqData

    // 1. Busca dados do Cliente
    const { data: pedidoData, error: dbPedidoError } = await supabaseClient
      .from('pedidos')
      .select('*, clientes(*)')
      .eq('id', pedidoId)
      .single();

    if (dbPedidoError || !pedidoData || !pedidoData.clientes) {
       throw new Error('Falha ao buscar dados do cliente vinculado ao pedido.');
    }
    
    const cliente = pedidoData.clientes;

    // 2. Inicializa Stripe
    if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurada no Supabase.');
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 3. Cria Checkout Session
    // Stripe PIX exige que o cliente tenha nome e CPF (tax_id)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: titulo,
              description: "Garimpo da Moda - Peça Única Exclusiva",
            },
            unit_amount: precoCents, // Já vem em centavos do frontend
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: "https://fabianocoutop.github.io/garimpodamoda/",
      cancel_url: "https://fabianocoutop.github.io/garimpodamoda/",
      customer_email: cliente.email,
      metadata: {
        pedidoId: pedidoId.toString(),
        produtoId: idProduto.toString()
      }
    });

    console.log("Stripe Session Criada:", session.id)
    
    const paymentUrl = session.url;
    if (!paymentUrl) {
          throw new Error("Stripe não retornou uma URL válida.");
    }
    
    // Salva o link do Stripe e o ID da sessão no banco
    await supabaseClient.from('pedidos').update({ 
      link_pagamento: paymentUrl,
      billing_id: session.id 
    }).eq('id', pedidoId);

    return new Response(JSON.stringify({ paymentUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Erro no checkout Stripe:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

