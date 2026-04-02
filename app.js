// Variáveis do Supabase do Projeto Garimpo da Moda
const SUPABASE_URL = 'https://rjjbxpssymaauqzpooig.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqamJ4cHNzeW1hYXVxenBvb2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQzMDcsImV4cCI6MjA5MDc0MDMwN30.595t4Df-jcn2JkZhKWVgb5E7pOjv2hj7_5eAba3PidQ';

let _supabase = null;
let useMockData = false; // Fluxo 100% autêntico via Cloud agora!

// Dados fictícios (Gerados baseados na IA)
let mockProdutos = [
    {
        id: 1,
        titulo: 'Blazer Vintage Anos 90',
        descricao: 'Blazer em lã pura de alfaiataria importada. Peça única e exclusiva.',
        preco: 129.90,
        imagem_url: 'img/blazer.png',
        disponivel: true,
        tamanho: 'P'
    },
    {
        id: 2,
        titulo: 'Vestido de Festa Seda',
        descricao: 'Fluido e muito elegante na cor rosa blush. Ideal para final de semana.',
        preco: 189.90,
        imagem_url: 'img/vestido.png',
        disponivel: true,
        tamanho: 'M'
    },
    {
        id: 3,
        titulo: 'Calça de Alfaiataria Nude',
        descricao: 'Corte reto, cintura super alta. Valoriza demais a silhueta.',
        preco: 89.90,
        imagem_url: 'img/calca.png',
        disponivel: true,
        tamanho: 'G'
    }
];

// Iniciação
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

// Inicializar banco ou ambiente mock
async function initApp() {
    if (SUPABASE_URL !== 'COLOQUE_AQUI_A_URL') {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        useMockData = false;
    }
    await carregarProdutos();
}

// Buscar produtos do banco ou usar mock
async function carregarProdutos() {
    const vitrine = document.getElementById('vitrine');
    let produtos = [];

    if (useMockData) {
        produtos = mockProdutos;
    } else {
        const { data, error } = await _supabase.from('produtos').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error("Erro Supabase:", error);
            vitrine.innerHTML = `<p class="error-msg">Erro ao conectar com o catálogo de peças. Reinicie.</p>`;
            return;
        }
        produtos = data;
    }

    renderizarVitrine(produtos);
}

// Exibir na tela (HTML)
function renderizarVitrine(produtos) {
    const vitrine = document.getElementById('vitrine');
    vitrine.innerHTML = '';

    if (produtos.length === 0) {
         vitrine.innerHTML = `<div class="loading">Infelizmente nosso estoque zrou! Acompanhe o instagram para novidades.</div>`;
         return;
    }

    produtos.forEach(peça => {
        const precoFormatado = peça.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const disponivelTxt = peça.disponivel ? "Comprar Agora" : "Vendida / Paga";
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${peça.imagem_url}" alt="${peça.titulo}" class="card-img" onerror="this.src='https://via.placeholder.com/300x400?text=Sem+Foto'">
            <div class="card-body">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 class="card-title">${peça.titulo}</h3>
                    <span class="tag-tamanho">${peça.tamanho}</span>
                </div>
                <p class="card-desc">${peça.descricao}</p>
                <div class="card-footer">
                    <span class="price">${precoFormatado}</span>
                </div>
                <button class="btn-primary" 
                    ${!peça.disponivel ? 'disabled' : ''} 
                    onclick="abrirCheckout(${peça.id}, '${peça.titulo}', ${peça.preco}, '${peça.imagem_url}')">
                    ${disponivelTxt}
                </button>
            </div>
        `;
        vitrine.appendChild(card);
    });
}

// ----------------- CHECKOUT LOGIC ----------------- //

function abrirCheckout(id, titulo, preco, imagem) {
    document.getElementById('checkout-overlay').style.display = 'flex';
    document.getElementById('produto-id-selecionado').value = id;
    document.getElementById('produto-titulo-selecionado').value = titulo;
    document.getElementById('produto-preco-selecionado').value = preco;
    
    // Atualiza resumo
    const precoFormatado = preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('product-summary').innerHTML = `
        <img src="${imagem}" class="summary-img">
        <div>
            <strong>${titulo}</strong>
            <br>
            <span class="price">${precoFormatado}</span>
        </div>
    `;
}

function fecharCheckout() {
    document.getElementById('checkout-overlay').style.display = 'none';
    document.getElementById('checkout-form').reset();
    document.getElementById('checkout-error').style.display = 'none';
}

// Quando clicar em finalizar
async function processarPedido(event) {
    event.preventDefault(); // Evita recarregar a página
    
    const btn = document.getElementById('btn-finalizar');
    const erroDisplay = document.getElementById('checkout-error');
    
    btn.innerHTML = 'Processando...';
    btn.disabled = true;
    erroDisplay.style.display = 'none';

    // Capturando dados do form
    const idProduto = document.getElementById('produto-id-selecionado').value;
    const nome = document.getElementById('nome').value;
    const insta = document.getElementById('instagram').value;
    const endereco = document.getElementById('endereco').value;
    const tituloProdutoSelecionado = document.getElementById('produto-titulo-selecionado').value;
    const precoProdutoSelecionado = parseFloat(document.getElementById('produto-preco-selecionado').value);

    try {
        if (!useMockData) {
            // FLUXO REAL COM BANCO DE DADOS E NUVEM
            // 1 + 2. Processamento hiper-seguro via RPC`n             const { data: pedidoId, error: rpcError } = await _supabase.rpc('fechar_pedido', { p_nome: nome, p_instagram: insta, p_endereco: endereco, p_produto_id: idProduto });`n             if (rpcError) throw new Error("A Base de Dados recusou: " + rpcError.message);
             
             // 3. Invoca a Função de Gateway Edge (Vai processar a chave AbacatePay blindada)
             const resEdge = await _supabase.functions.invoke('create-payment-link', {
                 body: { 
                     idProduto: idProduto, 
                     pedidoId: pedidoId, 
                     titulo: tituloProdutoSelecionado,
                     precoCents: Math.round(precoProdutoSelecionado * 100) 
                 }
             });

             if (resEdge.error) throw new Error("Erro na geração do link de pagamento na Nuvem: " + resEdge.error.message);
             const checkoutUrl = resEdge.data.paymentUrl;
             
             // 4. Redireciona o usuário para o PIX / Checkout nativo
             window.location.href = checkoutUrl;

        } else {
            // FLUXO MOCK
            const prod = mockProdutos.find(p => p.id == idProduto);
            if (prod) prod.disponivel = false; // Torna indisponível visualmente
        }
        
        // Simular o tempo de geração do link no AbacatePay
        setTimeout(() => {
            alert('A peça foi reservada e você agora seria redirecionada para a página do ABACATEPAY para realizar o Pix/Cartão!');
            fecharCheckout();
            
            // Recarrega o grid para mostrar que a peça consta ' Vendida / Paga'
            carregarProdutos();
            
            // Reset Botão se a pessoa voltar do link de pagamento
            btn.innerHTML = 'Ir para Pagamento (AbacatePay)';
            btn.disabled = false;
        }, 1500);

    } catch (e) {
        console.error("Houve erro ao processar: ", e);
        erroDisplay.innerHTML = "Ocorreu um erro interno na loja. Tente novamente mais tarde.";
        erroDisplay.style.display = 'block';
        btn.innerHTML = 'Ir para Pagamento (AbacatePay)';
        btn.disabled = false;
    }
}

