import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Stripe from 'https://esm.sh/stripe@14.15.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const LOJA_EMAIL = 'fcoutopereira@gmail.com'

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  try {
    const body = await req.text()
    const stripe = new Stripe(STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET!
    )

    console.log(`Evento recebido: ${event.type}`)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const pedidoId = session.metadata?.pedidoId
      const produtoId = session.metadata?.produtoId

      if (!pedidoId) {
        console.error('PedidoId não encontrado nos metadados da sessão')
        return new Response('Metadata missing', { status: 200 })
      }

      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // 1. Atualizar Pedido para PAGO
      const { error: updatePedidoError } = await supabaseClient
        .from('pedidos')
        .update({ status_pagamento: 'pago' })
        .eq('id', pedidoId)

      if (updatePedidoError) throw updatePedidoError

      // 2. Marcar Produto como INDISPONÍVEL
      const { error: updateProdutoError } = await supabaseClient
        .from('produtos')
        .update({ disponivel: false })
        .eq('id', produtoId)

      if (updateProdutoError) throw updateProdutoError

      console.log(`Venda confirmada! Pedido: ${pedidoId}, Produto: ${produtoId}`)

      // 3. Enviar E-mail (Resend)
      if (RESEND_API_KEY) {
        // Busca detalhes para o e-mail
        const { data: pedidoFull } = await supabaseClient
          .from('pedidos')
          .select('*, clientes(*), produtos(*)')
          .eq('id', pedidoId)
          .single()

        if (pedidoFull) {
          const c = pedidoFull.clientes
          const pr = pedidoFull.produtos
          const metodo = session.payment_method_types?.[0] || 'Stripe'
          const dataVenda = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          const precoFmt = pr ? `R$ ${Number(pr.preco).toFixed(2).replace('.', ',')}` : 'N/A'

          const htmlEmail = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f5f0eb;">
            <div style="max-width:600px;margin:20px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <div style="background:linear-gradient(135deg,#c9a87c,#a0845c);padding:32px;text-align:center;">
                <h1 style="color:white;margin:0;font-size:24px;font-weight:600;">Venda Confirmada (Stripe)!</h1>
                <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Garimpo da Moda</p>
              </div>
              <div style="padding:32px;">
                <div style="background:#f9f6f2;border-radius:12px;padding:20px;margin-bottom:24px;">
                  <h2 style="color:#a0845c;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Produto Vendido</h2>
                  <p style="font-size:18px;font-weight:600;color:#333;margin:0 0 4px;">${pr?.titulo || 'N/A'}</p>
                  <p style="color:#666;margin:0 0 4px;font-size:14px;">Tamanho: ${pr?.tamanho || 'U'}</p>
                  <p style="font-size:22px;font-weight:700;color:#a0845c;margin:8px 0 0;">${precoFmt}</p>
                </div>
                <div style="border-left:3px solid #c9a87c;padding-left:16px;margin-bottom:24px;">
                  <h2 style="color:#a0845c;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Dados do Comprador</h2>
                  <p style="font-size:14px;line-height:1.6;color:#444;">
                    <strong>Nome:</strong> ${c?.nome || 'N/A'}<br>
                    <strong>CPF:</strong> ${c?.cpf || 'N/A'}<br>
                    <strong>E-mail:</strong> ${c?.email || 'N/A'}<br>
                    <strong>Telefone:</strong> ${c?.telefone || 'N/A'}
                  </p>
                </div>
                <div style="border-left:3px solid #c9a87c;padding-left:16px;margin-bottom:24px;">
                  <h2 style="color:#a0845c;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Endereço de Entrega</h2>
                  <p style="font-size:14px;line-height:1.6;color:#444;">
                    ${c?.rua}, ${c?.numero}<br>
                    ${c?.bairro}<br>
                    ${c?.cidade} - ${c?.estado}<br>
                    CEP: ${c?.cep}
                  </p>
                </div>
                <div style="background:#f0fdf4;border-radius:12px;padding:16px;text-align:center;">
                  <p style="color:#16a34a;font-weight:600;margin:0 0 4px;">Pagamento Confirmado via Stripe</p>
                  <p style="color:#666;font-size:13px;margin:0;">Metodo: ${metodo.toUpperCase()} | Sessão: ${session.id.slice(-8)} | ${dataVenda}</p>
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
              subject: `Venda Confirmada! ${pr?.titulo || 'Produto'} - ${precoFmt}`,
              html: htmlEmail
            })
          })
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error(`Erro no webhook: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})
