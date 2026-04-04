import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Webhook MP recebido:', JSON.stringify(body))

    // MP envia notificações de vários tipos; só processamos "payment"
    if (body.type !== 'payment') {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const paymentId = body.data?.id
    if (!paymentId) {
      console.error('Webhook sem payment ID')
      return new Response('OK', { status: 200 })
    }

    // --- Buscar pagamento completo na API do MP para verificar autenticidade ---
    if (!MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN não configurado.')

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
    })

    if (!mpResponse.ok) {
      console.error('Erro ao buscar pagamento no MP:', mpResponse.status)
      return new Response('OK', { status: 200 })
    }

    const payment = await mpResponse.json()
    const pedidoId = payment.metadata?.pedido_id

    if (!pedidoId) {
      console.log('Pagamento sem pedido_id no metadata, ignorando.')
      return new Response('OK', { status: 200 })
    }

    console.log(`Pagamento ${paymentId} - Status: ${payment.status} - Pedido: ${pedidoId}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // --- Mapear status do MP para status interno ---
    const statusMap: Record<string, string> = {
      'approved': 'aprovado',
      'rejected': 'rejeitado',
      'cancelled': 'cancelado',
      'refunded': 'reembolsado',
      'charged_back': 'reembolsado',
      'pending': 'pendente',
      'in_process': 'em_processamento',
      'authorized': 'em_processamento',
    }

    const statusInterno = statusMap[payment.status] || 'pendente'

    // --- Atualizar pedido ---
    await supabase.from('pedidos').update({
      status_pagamento: statusInterno,
      mp_status: payment.status,
      mp_payment_id: String(paymentId),
    }).eq('id', pedidoId)

    // --- Ações conforme status ---
    if (payment.status === 'approved') {
      // Pagamento confirmado! Produtos já estão reservados (disponivel=false desde a criação)
      console.log(`Pedido ${pedidoId} APROVADO.`)

    } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)) {
      // Pagamento falhou/cancelado: re-habilitar produtos
      console.log(`Pedido ${pedidoId} ${payment.status}. Re-habilitando produtos.`)

      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('produto_id')
        .eq('pedido_id', pedidoId)

      if (itens && itens.length > 0) {
        const produtoIds = itens.map(i => i.produto_id)
        for (const pid of produtoIds) {
          await supabase.from('produtos').update({ disponivel: true }).eq('id', pid)
        }
      }
    }
    // Para pending/in_process: não fazer nada, produtos continuam reservados

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Erro webhook-mercadopago:', error)
    // Sempre retornar 200 para o MP não retentar indefinidamente
    return new Response(JSON.stringify({ received: true, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
