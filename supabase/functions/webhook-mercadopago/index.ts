import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const LOJA_EMAIL = 'fcoutopereira@gmail.com'

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
      // Pagamento confirmado! Marcar produtos como vendidos agora
      console.log(`Pedido ${pedidoId} APROVADO. Marcando produtos como vendidos.`)

      const { data: itens } = await supabase
        .from('pedido_itens')
        .select('produto_id')
        .eq('pedido_id', pedidoId)

      if (itens && itens.length > 0) {
        const produtoIds = itens.map(i => i.produto_id)
        for (const pid of produtoIds) {
          await supabase.from('produtos').update({ disponivel: false }).eq('id', pid)
        }
      }

      // --- Enviar E-mail (Resend) ---
      if (RESEND_API_KEY) {
        try {
          // Buscar detalhes completos do pedido (cliente e itens/produtos)
          const { data: pedidoFull } = await supabase
            .from('pedidos')
            .select(`
              *,
              clientes (*),
              pedido_itens (
                preco_unitario,
                produtos (*)
              )
            `)
            .eq('id', pedidoId)
            .single()

          if (pedidoFull) {
            const c = pedidoFull.clientes
            const itensPed = pedidoFull.pedido_itens || []
            
            // Metodo MP
            const metodo = payment.payment_method_id || 'Mercado Pago'
            const dataVenda = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            
            // Montar lista de produtos HTML
            let htmlProdutos = ''
            for (const item of itensPed) {
              const pr = item.produtos
              const pPreco = pr ? `R$ ${Number(item.preco_unitario).toFixed(2).replace('.', ',')}` : 'N/A'
              htmlProdutos += `
                <div style="background:#f9f6f2;border-radius:12px;padding:20px;margin-bottom:12px;">
                  <h2 style="color:#a0845c;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Produto Vendido</h2>
                  <p style="font-size:18px;font-weight:600;color:#333;margin:0 0 4px;">${pr?.titulo || 'N/A'}</p>
                  <p style="color:#666;margin:0 0 4px;font-size:14px;">Tamanho: ${pr?.tamanho || 'U'}</p>
                  <p style="font-size:22px;font-weight:700;color:#a0845c;margin:8px 0 0;">${pPreco}</p>
                </div>
              `
            }

            const valorTotalFmt = `R$ ${Number(pedidoFull.valor_total).toFixed(2).replace('.', ',')}`

            const htmlEmail = `
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f0eb;">
              <div style="max-width:600px;margin:20px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                <div style="background:linear-gradient(135deg,#c9a87c,#a0845c);padding:32px;text-align:center;">
                  <h1 style="color:white;margin:0;font-size:24px;font-weight:600;">Venda Confirmada (Mercado Pago)!</h1>
                  <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Garimpo da Moda</p>
                </div>
                <div style="padding:32px;">
                  
                  ${htmlProdutos}

                  <div style="text-align: right; margin-bottom: 24px;">
                    <h3 style="color:#333; font-size:18px; margin:0;">Total c/ Frete: <span style="color:#a0845c;">${valorTotalFmt}</span></h3>
                  </div>

                  <div style="border-left:3px solid #c9a87c;padding-left:16px;margin-bottom:24px;">
                    <h2 style="color:#a0845c;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Dados do Comprador</h2>
                    <p style="font-size:14px;line-height:1.6;color:#444;">
                      <strong>Nome:</strong> ${c?.nome || 'N/A'}<br>
                      <strong>CPF:</strong> ${c?.cpf || 'N/A'}<br>
                      <strong>E-mail:</strong> ${c?.email || 'N/A'}<br>
                      <strong>Instagram:</strong> ${c?.instagram || 'N/A'}<br>
                      <strong>Telefone:</strong> ${c?.telefone || 'N/A'}
                    </p>
                  </div>
                  <div style="border-left:3px solid #c9a87c;padding-left:16px;margin-bottom:24px;">
                    <h2 style="color:#a0845c;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Endereço de Entrega (CEP: ${c?.cep})</h2>
                    <p style="font-size:14px;line-height:1.6;color:#444;">
                      ${c?.rua}, ${c?.numero}<br>
                      ${c?.bairro}<br>
                      ${c?.cidade} - ${c?.estado}
                    </p>
                  </div>
                  <div style="background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
                    <p style="color:#16a34a;font-weight:600;margin:0 0 4px;">Pagamento Confirmado no Mercado Pago</p>
                    <p style="color:#666;font-size:13px;margin:0;">Método: ${metodo.toUpperCase()} | Pedido Interno: ${pedidoId} | Pagamento MP: ${paymentId} <br>${dataVenda}</p>
                  </div>
                </div>
              </div>
            </body>
            </html>`

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
              },
              body: JSON.stringify({
                from: 'Garimpo da Moda <onboarding@resend.dev>',
                to: [LOJA_EMAIL],
                subject: `Venda Confirmada! ${itensPed.length} peça(s) - ${valorTotalFmt}`,
                html: htmlEmail
              })
            })
          }
        } catch (emailErr) {
          console.error('Erro ao enviar e-mail via Resend:', emailErr)
        }
      }

    } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)) {
      // Pagamento falhou/cancelado/reembolsado: garantir que produtos estejam disponíveis
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
    // Para pending/in_process: não fazer nada, produtos continuam disponíveis

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
