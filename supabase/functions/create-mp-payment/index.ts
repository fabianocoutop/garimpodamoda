import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const { customer, cart_items, payment, shipping_method, shipping_cost, cep_destino } = await req.json()

    // --- Validações ---
    if (!customer?.nome || !customer?.email || !customer?.cpf) {
      return jsonResponse({ success: false, error: 'Dados do cliente incompletos.' }, 400)
    }
    if (!cart_items || cart_items.length === 0) {
      return jsonResponse({ success: false, error: 'Carrinho vazio.' }, 400)
    }
    if (!payment?.method) {
      return jsonResponse({ success: false, error: 'Método de pagamento não informado.' }, 400)
    }
    if (!MP_ACCESS_TOKEN) {
      throw new Error('MP_ACCESS_TOKEN não configurado.')
    }

    // --- Verificar disponibilidade dos produtos no banco ---
    const productIds = cart_items.map((item: { id: number }) => item.id)
    const { data: dbProducts, error: prodError } = await supabase
      .from('produtos')
      .select('id, preco, titulo, disponivel, peso')
      .in('id', productIds)

    if (prodError) throw new Error('Erro ao verificar produtos: ' + prodError.message)
    if (!dbProducts || dbProducts.length !== productIds.length) {
      return jsonResponse({ success: false, error: 'Um ou mais produtos não encontrados.' }, 400)
    }

    // --- Lógica de Frete no Servidor (mesma config do frontend) ---
    const SHIP_BOXES = [
      { maxItems: 2,   c: 20,   l: 15, a: 5,  boxWeight: 0.15 },
      { maxItems: 4,   c: 25,   l: 20, a: 7,  boxWeight: 0.15 },
      { maxItems: 6,   c: 30,   l: 22, a: 10, boxWeight: 0.20 },
      { maxItems: 10,  c: 33.5, l: 27, a: 14, boxWeight: 0.25 },
      { maxItems: 999, c: 40,   l: 30, a: 15, boxWeight: 0.30 },
    ]
    const DEFAULT_WEIGHT = 0.50

    const qtdItens = dbProducts.length
    const box = SHIP_BOXES.find(b => qtdItens <= b.maxItems) || SHIP_BOXES[SHIP_BOXES.length - 1]
    const pesoItens = dbProducts.reduce((sum: number, p: any) => sum + (Number(p.peso) || DEFAULT_WEIGHT), 0)
    const pesoTotal = Math.max(box.boxWeight + pesoItens, 0.3)

    let valorFrete = 30.00 // fallback

    if (cep_destino && shipping_method) {
      try {
        const cepOrigem = '29937400'
        const cepDestino = cep_destino.replace(/\D/g, '')

        const url = `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?nCdServico=${shipping_method}&sCepOrigem=${cepOrigem}&sCepDestino=${cepDestino}&nVlPeso=${pesoTotal}&nCdFormato=1&nVlComprimento=${box.c}&nVlAltura=${box.a}&nVlLargura=${box.l}&nVlDiametro=0&sCdMaoPropria=n&nVlValorDeclarado=0&sCdAvisoRecebimento=n&StrRetorno=xml`

        const correiosRes = await fetch(url)
        const xml = await correiosRes.text()

        const valorMatch = xml.match(/<Valor>([^<]+)<\/Valor>/)
        if (valorMatch) {
          valorFrete = parseFloat(valorMatch[1].replace(',', '.'))
        }
      } catch (e) {
        console.error('Erro ao validar frete nos Correios:', e)
        if (shipping_cost && Number(shipping_cost) > 15) {
          valorFrete = Number(shipping_cost)
        }
      }
    }

    // --- Calcular total do servidor (Produtos + Frete) ---
    const subtotal = dbProducts.reduce((sum: number, p: any) => sum + Number(p.preco), 0)
    const valorTotal = subtotal + valorFrete

    // --- Inserir/Upsert Cliente ---
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .upsert({
        nome: customer.nome,
        instagram: customer.instagram || '',
        email: customer.email,
        cpf: customer.cpf,
        telefone: customer.telefone || '',
        endereco: `${customer.rua}, ${customer.numero} - ${customer.bairro}, ${customer.cidade}/${customer.estado} - ${customer.cep}`,
        cep: customer.cep || '',
        rua: customer.rua || '',
        numero: customer.numero || '',
        bairro: customer.bairro || '',
        cidade: customer.cidade || '',
        estado: customer.estado || '',
      }, { onConflict: 'id' })
      .select('id')
      .single()

    // Se upsert falhou (sem conflict column), tenta insert direto
    let clienteId: string
    if (clienteError || !clienteData) {
      const { data: inserted, error: insertErr } = await supabase
        .from('clientes')
        .insert({
          nome: customer.nome,
          instagram: customer.instagram || '',
          email: customer.email,
          cpf: customer.cpf,
          telefone: customer.telefone || '',
          endereco: `${customer.rua}, ${customer.numero} - ${customer.bairro}, ${customer.cidade}/${customer.estado} - ${customer.cep}`,
          cep: customer.cep || '',
          rua: customer.rua || '',
          numero: customer.numero || '',
          bairro: customer.bairro || '',
          cidade: customer.cidade || '',
          estado: customer.estado || '',
        })
        .select('id')
        .single()
      if (insertErr || !inserted) throw new Error('Erro ao salvar cliente: ' + (insertErr?.message || 'unknown'))
      clienteId = inserted.id
    } else {
      clienteId = clienteData.id
    }

    // --- Criar Pedido ---
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        cliente_id: clienteId,
        valor_total: valorTotal,
        status_pagamento: 'pendente',
        mp_status: 'pending',
      })
      .select('id')
      .single()

    if (pedidoError || !pedido) throw new Error('Erro ao criar pedido: ' + (pedidoError?.message || 'unknown'))
    const pedidoId = pedido.id

    // --- Criar pedido_itens ---
    const itens = dbProducts.map(p => ({
      pedido_id: pedidoId,
      produto_id: p.id,
      preco_unitario: Number(p.preco),
    }))
    const { error: itensError } = await supabase.from('pedido_itens').insert(itens)
    if (itensError) throw new Error('Erro ao salvar itens: ' + itensError.message)

    // Produtos NÃO são reservados aqui.
    // Só serão marcados como vendidos quando o pagamento for confirmado (via webhook ou aprovação instantânea de cartão).

    // --- Montar payload do Mercado Pago ---
    const cpfClean = customer.cpf.replace(/\D/g, '')
    const nomeParts = customer.nome.trim().split(' ')
    const firstName = nomeParts[0]
    const lastName = nomeParts.slice(1).join(' ') || firstName

    const descricao = dbProducts.map(p => p.titulo).join(' + ') + ` (+ Frete R$ ${valorFrete.toFixed(2)})`

    const mpPayload: Record<string, unknown> = {
      transaction_amount: Number(valorTotal.toFixed(2)),
      description: `Garimpo da Moda - ${descricao}`.substring(0, 256),
      payer: {
        email: customer.email,
        first_name: firstName,
        last_name: lastName,
        identification: {
          type: 'CPF',
          number: cpfClean,
        },
      },
      metadata: {
        pedido_id: String(pedidoId),
      },
      notification_url: `${SUPABASE_URL}/functions/v1/webhook-mercadopago`,
    }

    if (payment.method === 'pix') {
      mpPayload.payment_method_id = 'pix'
    } else {
      // Cartão de crédito ou débito
      if (!payment.token) {
        return jsonResponse({ success: false, error: 'Token do cartão não informado.' }, 400)
      }
      mpPayload.token = payment.token
      mpPayload.installments = payment.installments || 1
      mpPayload.payment_method_id = payment.payment_method_id
      if (payment.issuer_id) {
        mpPayload.issuer_id = payment.issuer_id
      }
    }

    // --- Chamar API do Mercado Pago ---
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `pedido-${pedidoId}-${Date.now()}`,
      },
      body: JSON.stringify(mpPayload),
    })

    const mpData = await mpResponse.json()

    if (!mpResponse.ok) {
      console.error('Erro MP API:', JSON.stringify(mpData))
      await supabase.from('pedidos').update({
        status_pagamento: 'erro',
        mp_status: mpData.status || 'error',
      }).eq('id', pedidoId)

      const errorMsg = mpData.message || mpData.cause?.[0]?.description || 'Erro ao processar pagamento.'
      return jsonResponse({ success: false, error: errorMsg }, 400)
    }

    // --- Atualizar pedido com dados do MP ---
    await supabase.from('pedidos').update({
      mp_payment_id: String(mpData.id),
      mp_status: mpData.status,
      status_pagamento: mpData.status === 'approved' ? 'aprovado' : 'pendente',
    }).eq('id', pedidoId)

    // --- Montar resposta ---
    if (payment.method === 'pix') {
      const txData = mpData.point_of_interaction?.transaction_data
      return jsonResponse({
        success: true,
        payment_method: 'pix',
        pedido_id: pedidoId,
        mp_payment_id: mpData.id,
        qr_code_base64: txData?.qr_code_base64 || '',
        qr_code: txData?.qr_code || '',
        expiration: mpData.date_of_expiration,
      })
    } else {
      // Cartão
      if (mpData.status === 'approved') {
        // Cartão aprovado instantaneamente: marcar produtos como vendidos agora
        for (const pid of productIds) {
          await supabase.from('produtos').update({ disponivel: false }).eq('id', pid)
        }
        return jsonResponse({
          success: true,
          payment_method: payment.method,
          pedido_id: pedidoId,
          status: 'approved',
        })
      } else if (mpData.status === 'rejected') {
        await supabase.from('pedidos').update({ status_pagamento: 'rejeitado' }).eq('id', pedidoId)
        return jsonResponse({
          success: false,
          status: 'rejected',
          status_detail: mpData.status_detail,
        })
      } else {
        // in_process, pending (3DS challenge, etc.)
        return jsonResponse({
          success: true,
          payment_method: payment.method,
          pedido_id: pedidoId,
          status: mpData.status,
          status_detail: mpData.status_detail,
        })
      }
    }

  } catch (error) {
    console.error('Erro create-mp-payment:', error)
    return jsonResponse({ success: false, error: (error as Error).message }, 500)
  }
})
