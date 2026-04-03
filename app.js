// Variáveis do Supabase do Projeto Garimpo da Moda
const SUPABASE_URL = 'https://rjjbxpssymaauqzpooig.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqamJ4cHNzeW1hYXVxenBvb2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQzMDcsImV4cCI6MjA5MDc0MDMwN30.595t4Df-jcn2JkZhKWVgb5E7pOjv2hj7_5eAba3PidQ';

let _supabase = null;
let useMockData = true; // Voltamos ao modo Mock para reservas manuais por enquanto

// ---- CARRINHO DE COMPRAS ---- //
let carrinho = [];
try { carrinho = JSON.parse(localStorage.getItem('carrinho') || '[]'); } catch(e) { carrinho = []; }
let produtosCarregados = [];

function salvarCarrinho() {
    try { localStorage.setItem('carrinho', JSON.stringify(carrinho)); } catch(e) { /* quota exceeded or disabled */ }
}

function adicionarAoCarrinho(id) {
    const produto = produtosCarregados.find(p => p.id === id);
    if (!produto || !produto.disponivel) return;
    if (estaNoCarrinho(id)) return;
    carrinho.push({
        id: produto.id,
        titulo: produto.titulo,
        preco: produto.preco,
        imagem_url: produto.imagem_url,
        tamanho: produto.tamanho
    });
    salvarCarrinho();
    atualizarBadgeCarrinho();
    renderizarVitrine(produtosCarregados);
    renderizarCarrinhoSidebar();
}

function removerDoCarrinho(id) {
    carrinho = carrinho.filter(item => item.id !== id);
    salvarCarrinho();
    atualizarBadgeCarrinho();
    renderizarVitrine(produtosCarregados);
    renderizarCarrinhoSidebar();
}

function limparCarrinho() {
    carrinho = [];
    salvarCarrinho();
    atualizarBadgeCarrinho();
}

function estaNoCarrinho(id) {
    return carrinho.some(item => item.id === id);
}

function totalCarrinho() {
    return carrinho.reduce((sum, item) => sum + item.preco, 0);
}

function atualizarBadgeCarrinho() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    badge.textContent = carrinho.length;
    badge.style.display = carrinho.length > 0 ? 'flex' : 'none';
}

function validarCarrinho(produtos) {
    const idsDisponiveis = new Set(produtos.filter(p => p.disponivel).map(p => p.id));
    const tamanhoOriginal = carrinho.length;
    carrinho = carrinho.filter(item => idsDisponiveis.has(item.id));
    if (carrinho.length !== tamanhoOriginal) {
        salvarCarrinho();
    }
    atualizarBadgeCarrinho();
}

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

    produtosCarregados = produtos;
    renderizarVitrine(produtos);
    validarCarrinho(produtos);
}

// Exibir na tela (HTML)
function renderizarVitrine(produtos) {
    const vitrine = document.getElementById('vitrine');
    vitrine.innerHTML = '';

    if (produtos.length === 0) {
         vitrine.innerHTML = `<div class="loading">Infelizmente nosso estoque zerou! Acompanhe o instagram para novidades.</div>`;
         return;
    }

    produtos.forEach(peça => {
        const precoFormatado = peça.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        let btnHtml;
        if (!peça.disponivel) {
            btnHtml = `<button class="btn-primary" disabled>Vendida / Paga</button>`;
        } else if (estaNoCarrinho(peça.id)) {
            btnHtml = `<button class="btn-in-cart" onclick="removerDoCarrinho(${peça.id})">&#10003; No Carrinho</button>`;
        } else {
            btnHtml = `<button class="btn-primary" onclick="adicionarAoCarrinho(${peça.id})">Adicionar ao Carrinho</button>`;
        }

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
                ${btnHtml}
            </div>
        `;
        vitrine.appendChild(card);
    });
}

// ----------------- MÁSCARAS E CEP ----------------- //

function maskCpf(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    i.value = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length <= 10) {
        i.value = v.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    } else {
        i.value = v.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
    }
}

function maskCep(i) {
    let v = i.value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    i.value = v.replace(/(\d{5})(\d)/, "$1-$2");
}

async function buscarCep(cepFormatado) {
    const cep = cepFormatado.replace(/\D/g, "");
    if (cep.length !== 8) return;
    
    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
            document.getElementById('rua').value = data.logradouro || '';
            document.getElementById('bairro').value = data.bairro || '';
            document.getElementById('cidade').value = data.localidade || '';
            document.getElementById('estado').value = data.uf || '';
            document.getElementById('numero').focus();
        }
    } catch(e) {
        console.error("Erro viaCep:", e);
    }
}

// ----------------- SIDEBAR DO CARRINHO ----------------- //

function toggleCarrinho() {
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar.classList.contains('open')) {
        fecharCarrinho();
    } else {
        abrirCarrinho();
    }
}

function abrirCarrinho() {
    document.getElementById('cart-sidebar').classList.add('open');
    document.getElementById('cart-overlay').style.display = 'block';
    renderizarCarrinhoSidebar();
}

function fecharCarrinho() {
    document.getElementById('cart-sidebar').classList.remove('open');
    document.getElementById('cart-overlay').style.display = 'none';
}

function renderizarCarrinhoSidebar() {
    const container = document.getElementById('cart-items');
    const footer = document.getElementById('cart-footer');

    if (carrinho.length === 0) {
        container.innerHTML = '<p class="cart-empty">Seu carrinho está vazio.</p>';
        footer.style.display = 'none';
        return;
    }

    footer.style.display = 'block';
    container.innerHTML = carrinho.map(item => {
        const precoFmt = item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `
        <div class="cart-item">
            <img src="${item.imagem_url}" alt="${item.titulo}" class="cart-item-img">
            <div class="cart-item-info">
                <strong>${item.titulo}</strong>
                <span class="tag-tamanho">${item.tamanho}</span>
                <span class="price">${precoFmt}</span>
            </div>
            <button class="cart-item-remove" onclick="removerDoCarrinho(${item.id})" aria-label="Remover">&times;</button>
        </div>`;
    }).join('');

    document.getElementById('cart-total-value').textContent =
        totalCarrinho().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ----------------- CHECKOUT LOGIC ----------------- //

function abrirCheckoutDoCarrinho() {
    if (carrinho.length === 0) return;
    fecharCarrinho();

    document.getElementById('checkout-overlay').style.display = 'flex';

    const summaryEl = document.getElementById('product-summary');
    const total = totalCarrinho();
    const totalFmt = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    summaryEl.innerHTML = carrinho.map(item => {
        const pFmt = item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `
        <div class="summary-item">
            <img src="${item.imagem_url}" class="summary-img">
            <div>
                <strong>${item.titulo}</strong><br>
                <span class="price">${pFmt}</span>
            </div>
        </div>`;
    }).join('') + `
    <div class="summary-total">
        <strong>Total (${carrinho.length} ${carrinho.length === 1 ? 'peça' : 'peças'}):</strong>
        <span class="price">${totalFmt}</span>
    </div>`;
}

function fecharCheckout() {
    document.getElementById('checkout-overlay').style.display = 'none';
    document.getElementById('checkout-form').reset();
    document.getElementById('checkout-error').style.display = 'none';
}

// Quando clicar em finalizar
async function processarPedido(event) {
    event.preventDefault();

    const btn = document.getElementById('btn-finalizar');
    const erroDisplay = document.getElementById('checkout-error');

    btn.innerHTML = 'Processando...';
    btn.disabled = true;
    erroDisplay.style.display = 'none';

    // Capturando dados do form
    const nome = document.getElementById('nome').value;
    const insta = document.getElementById('instagram').value;
    const email = document.getElementById('email').value;
    const cpf = document.getElementById('cpf').value;
    const telefone = document.getElementById('telefone').value;
    const cep = document.getElementById('cep').value;
    const rua = document.getElementById('rua').value;
    const numero = document.getElementById('numero').value;
    const bairro = document.getElementById('bairro').value;
    const cidade = document.getElementById('cidade').value;
    const estado = document.getElementById('estado').value;

    // Validação mínima de CPF
    const cpfClean = cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
        erroDisplay.innerHTML = "CPF Inválido.";
        erroDisplay.style.display = 'block';
        btn.innerHTML = 'Ir para Pagamento (Cartão ou PIX)';
        btn.disabled = false;
        return;
    }

    if (carrinho.length === 0) {
        erroDisplay.innerHTML = "Seu carrinho está vazio.";
        erroDisplay.style.display = 'block';
        btn.innerHTML = 'Ir para Pagamento (Cartão ou PIX)';
        btn.disabled = false;
        return;
    }

    try {
        // FLUXO MOCK - Marcar todas as peças do carrinho como indisponíveis
        const idsNoCarrinho = carrinho.map(item => item.id);
        idsNoCarrinho.forEach(id => {
            const prod = mockProdutos.find(p => p.id === id);
            if (prod) prod.disponivel = false;
        });

        // TODO: Integração Mercado Pago
        // - Criar preferência de pagamento com totalCarrinho() e itens do carrinho
        // - Redirecionar para checkout do Mercado Pago
        // - No callback de sucesso, criar registros no Supabase (clientes + pedidos)

        setTimeout(() => {
            const qtd = idsNoCarrinho.length;
            alert(`RESERVA REALIZADA! ${qtd} ${qtd === 1 ? 'peça reservada' : 'peças reservadas'}. Entraremos em contato via Instagram para finalizar o envio.`);
            limparCarrinho();
            fecharCheckout();
            carregarProdutos();
            btn.innerHTML = 'Ir para Pagamento (Cartão ou PIX)';
            btn.disabled = false;
        }, 1500);

    } catch (e) {
        console.error("Houve erro ao processar reserva: ", e);
        erroDisplay.innerHTML = "Ocorreu um erro ao processar sua reserva. Tente novamente.";
        erroDisplay.style.display = 'block';
        btn.innerHTML = 'Ir para Pagamento (Cartão ou PIX)';
        btn.disabled = false;
    }
}
