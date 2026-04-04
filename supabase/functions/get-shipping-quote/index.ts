import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function xmlToJson(xml: string, tag: string) {
  const regex = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g')
  const matches = [...xml.matchAll(regex)]
  return matches.map(m => m[1])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { cep_destino, peso, comprimento, largura, altura } = await req.json()
    const cepOrigem = '29937400'
    const cepDestino = cep_destino.replace(/\D/g, '')

    if (cepDestino.length !== 8) throw new Error('CEP de destino inválido.')

    // Validar dimensões com mínimos dos Correios
    const c = Math.max(Number(comprimento) || 16, 16)
    const l = Math.max(Number(largura) || 11, 11)
    const a = Math.max(Number(altura) || 2, 2)
    const p = Math.max(Number(peso) || 0.3, 0.3)

    // Serviços: 03298 (PAC), 03220 (SEDEX)
    const url = `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?nCdServico=03298,03220&sCepOrigem=${cepOrigem}&sCepDestino=${cepDestino}&nVlPeso=${p}&nCdFormato=1&nVlComprimento=${c}&nVlAltura=${a}&nVlLargura=${l}&nVlDiametro=0&sCdMaoPropria=n&nVlValorDeclarado=0&sCdAvisoRecebimento=n&StrRetorno=xml`

    const response = await fetch(url)
    const xml = await response.text()

    // Parsing manual do XML dos Correios (muito simples para justificar lib externa)
    const codigos = xmlToJson(xml, 'Codigo')
    const valores = xmlToJson(xml, 'Valor')
    const prazos = xmlToJson(xml, 'PrazoEntrega')
    const erros = xmlToJson(xml, 'Erro')
    const msgErros = xmlToJson(xml, 'MsgErro')

    const options = codigos.map((cod, i) => ({
      codigo: cod,
      nome: cod === '03298' ? 'PAC' : 'SEDEX',
      valor: parseFloat(valores[i].replace(',', '.')),
      prazo: parseInt(prazos[i]),
      erro: erros[i] !== '0',
      msgErro: msgErros[i]
    })).filter(opt => !opt.erro)

    if (options.length === 0) {
      throw new Error(msgErros[0] || 'Nenhum serviço de entrega disponível para este CEP.')
    }

    return new Response(JSON.stringify({ success: true, options }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
