// Variáveis do Supabase do Projeto Garimpo da Moda
const SUPABASE_URL = 'https://rjjbxpssymaauqzpooig.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqamJ4cHNzeW1hYXVxenBvb2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQzMDcsImV4cCI6MjA5MDc0MDMwN30.595t4Df-jcn2JkZhKWVgb5E7pOjv2hj7_5eAba3PidQ';

let _supabase = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 9;
let produtosFiltrados = [];

// ---- MERCADO PAGO ---- //
const MP_PUBLIC_KEY = 'APP_USR-ab1db545-20f5-41ad-9bcf-d6c473b29380';
let mpInstance = null;
let cardFormInstance = null;
let customerData = null;
let currentPedidoId = null;
let pixPollingInterval = null;
let currentShippingMethod = null;
let currentShippingCost = 0;
let shippingOptions = [];

// ---- CONFIG DE FRETE (editável) ---- //
// Origem: São Mateus/ES (CEP 29937-400)
// Preços baseados nas tabelas dos Correios 2026, arredondados para cima
const SHIPPING_CONFIG = {
    cepOrigem: '29937400',
    defaultWeightPerItem: 0.50, // kg
    boxes: [
        { name: 'PP', maxItems: 2,   comprimento: 20,   largura: 15, altura: 5,  boxWeight: 0.15 },
        { name: 'P',  maxItems: 4,   comprimento: 25,   largura: 20, altura: 7,  boxWeight: 0.15 },
        { name: 'M',  maxItems: 6,   comprimento: 30,   largura: 22, altura: 10, boxWeight: 0.20 },
        { name: 'G',  maxItems: 10,  comprimento: 33.5,  largura: 27, altura: 14, boxWeight: 0.25 },
        { name: 'GG', maxItems: 999, comprimento: 40,   largura: 30, altura: 15, boxWeight: 0.30 },
    ],
    // Tabela de preços por região (baseado nos 2 primeiros dígitos do CEP)
    // Cada região tem preço base PAC e SEDEX para até 1kg, + adicional por kg extra
    regions: [
        { name: 'ES (local)',     prefixes: ['29'],               pac: { base: 18, perKgExtra: 4, prazo: 3 },  sedex: { base: 25, perKgExtra: 6, prazo: 1 } },
        { name: 'RJ/MG',         prefixes: ['20','21','22','23','24','25','26','27','28','30','31','32','33','34','35','36','37','38','39'], pac: { base: 22, perKgExtra: 5, prazo: 5 }, sedex: { base: 32, perKgExtra: 7, prazo: 2 } },
        { name: 'SP',            prefixes: ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19'], pac: { base: 24, perKgExtra: 5, prazo: 6 }, sedex: { base: 35, perKgExtra: 8, prazo: 2 } },
        { name: 'BA/SE',         prefixes: ['40','41','42','43','44','45','46','47','48','49'],                 pac: { base: 25, perKgExtra: 6, prazo: 7 }, sedex: { base: 38, perKgExtra: 9, prazo: 3 } },
        { name: 'PR/SC/RS',      prefixes: ['80','81','82','83','84','85','86','87','88','89','90','91','92','93','94','95','96','97','98','99'], pac: { base: 28, perKgExtra: 6, prazo: 8 }, sedex: { base: 42, perKgExtra: 9, prazo: 3 } },
        { name: 'DF/GO/MS/MT',   prefixes: ['70','71','72','73','74','75','76','77','78','79'],                 pac: { base: 30, perKgExtra: 7, prazo: 8 }, sedex: { base: 45, perKgExtra: 10, prazo: 3 } },
        { name: 'NE (demais)',    prefixes: ['50','51','52','53','54','55','56','57','58','59','60','61','62','63','64','65','66','67','68','69'], pac: { base: 32, perKgExtra: 7, prazo: 10 }, sedex: { base: 48, perKgExtra: 10, prazo: 4 } },
        { name: 'Norte',         prefixes: [],                    pac: { base: 38, perKgExtra: 9, prazo: 12 }, sedex: { base: 55, perKgExtra: 12, prazo: 5 } },
    ]
};

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
        tamanho: produto.tamanho,
        peso: produto.peso // Adicionando peso para cálculo de frete
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

// Lógica de Envio - seleciona caixa por quantidade de itens
function calcularDadosEnvio() {
    const qtd = carrinho.length;
    const box = SHIPPING_CONFIG.boxes.find(b => qtd <= b.maxItems)
             || SHIPPING_CONFIG.boxes[SHIPPING_CONFIG.boxes.length - 1];
    const pesoItens = carrinho.reduce((acc, p) =>
        acc + (parseFloat(p.peso) || SHIPPING_CONFIG.defaultWeightPerItem), 0);
    return {
        peso: Math.max(box.boxWeight + pesoItens, 0.3),
        comprimento: box.comprimento,
        largura: box.largura,
        altura: box.altura,
    };
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

// ---- SEGURANÇA ---- //
function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

// Iniciação
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    if (typeof MercadoPago !== 'undefined') {
        mpInstance = new MercadoPago(MP_PUBLIC_KEY, { locale: 'pt-BR' });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase().trim();
            if (termo === '') {
                produtosFiltrados = produtosCarregados;
            } else {
                produtosFiltrados = produtosCarregados.filter(p => 
                    p.titulo.toLowerCase().includes(termo) || 
                    (p.descricao && p.descricao.toLowerCase().includes(termo))
                );
            }
            currentPage = 1; 
            renderizarVitrine(produtosFiltrados);
        });
    }

    await carregarProdutos();
}

async function carregarProdutos() {
    const vitrine = document.getElementById('vitrine');
    const { data, error } = await _supabase.from('produtos').select('*').order('disponivel', { ascending: false }).order('created_at', { ascending: false });
    if (error) {
        console.error("Erro Supabase:", error);
        vitrine.innerHTML = `<p class="error-msg">Erro ao conectar com o catálogo de peças. Reinicie.</p>`;
        return;
    }
    produtosCarregados = data;
    produtosFiltrados = data;
    renderizarVitrine(produtosFiltrados);
    validarCarrinho(data);
}

// Exibir na tela (HTML)
function renderizarVitrine(produtos) {
    const vitrine = document.getElementById('vitrine');
    vitrine.innerHTML = '';

    if (produtos.length === 0) {
         vitrine.innerHTML = `<div class="loading">Infelizmente nosso estoque zerou! Acompanhe o instagram para novidades.</div>`;
         return;
    }

    // Lógica da Paginação
    const totalPages = Math.ceil(produtos.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const paginatedProducts = produtos.slice(start, end);

    paginatedProducts.forEach(peça => {
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
            <img src="${escapeHtml(peça.imagem_url)}" alt="${escapeHtml(peça.titulo)}" class="card-img" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=Sem+Foto'">
            <div class="card-body">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 class="card-title">${escapeHtml(peça.titulo)}</h3>
                    <span class="tag-tamanho">${escapeHtml(peça.tamanho)}</span>
                </div>
                <p class="card-desc">${escapeHtml(peça.descricao)}</p>
                <div class="card-footer">
                    <span class="price">${precoFormatado}</span>
                </div>
                ${btnHtml}
            </div>
        `;
        vitrine.appendChild(card);
    });

    renderizarPaginacao(produtos.length);
}

function renderizarPaginacao(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    let paginationContainer = document.getElementById('paginacao-vitrine');
    
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'paginacao-vitrine';
        paginationContainer.className = 'pagination';
        const vitrine = document.getElementById('vitrine');
        if (vitrine) vitrine.insertAdjacentElement('afterend', paginationContainer);
    }

    paginationContainer.innerHTML = '';

    if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `btn-page ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => {
                currentPage = i;
                renderizarVitrine(produtosFiltrados);
                document.getElementById('vitrine').scrollIntoView({ behavior: 'smooth', block: 'start' });
            };
            paginationContainer.appendChild(btn);
        }
    } else {
        if (paginationContainer.parentNode) {
            paginationContainer.parentNode.removeChild(paginationContainer);
        }
    }
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
        if (!res.ok) return;
        const data = await res.json();
        if (!data.erro) {
            document.getElementById('rua').value = data.logradouro || '';
            document.getElementById('bairro').value = data.bairro || '';
            document.getElementById('cidade').value = data.localidade || '';
            document.getElementById('estado').value = data.uf || '';
            document.getElementById('numero').focus();

            // Calcular frete
            buscarFreteCorreios(cep);
        }
    } catch(e) {
        console.error("Erro viaCep:", e);
    }
}

function calcularFreteLocal(cep) {
    const prefix = cep.substring(0, 2);
    const dadosEnvio = calcularDadosEnvio();
    const pesoKg = dadosEnvio.peso;

    // Encontrar região pelo prefixo do CEP
    let region = SHIPPING_CONFIG.regions.find(r => r.prefixes.includes(prefix));
    if (!region) {
        // Fallback: região "Norte" (última, sem prefixes definidos)
        region = SHIPPING_CONFIG.regions[SHIPPING_CONFIG.regions.length - 1];
    }

    // Calcular preço: base (até 1kg) + adicional por kg extra
    const kgExtra = Math.max(0, Math.ceil(pesoKg) - 1);

    const pacPrice = region.pac.base + (kgExtra * region.pac.perKgExtra);
    const sedexPrice = region.sedex.base + (kgExtra * region.sedex.perKgExtra);

    return [
        { codigo: 'RETIRADA', nome: 'Retirar no local (Sao Mateus/ES)', valor: 0, prazo: 0 },
        { codigo: 'PAC',   nome: `PAC - ${escapeHtml(region.name)}`,   valor: pacPrice,   prazo: region.pac.prazo },
        { codigo: 'SEDEX', nome: `SEDEX - ${escapeHtml(region.name)}`, valor: sedexPrice, prazo: region.sedex.prazo },
    ];
}

function buscarFreteCorreios(cep) {
    const container = document.getElementById('shipping-options-container');
    if (!container) return;

    // Resetar seleção anterior
    currentShippingMethod = null;
    currentShippingCost = 0;

    // Mostrar container
    container.style.display = 'block';
    container.innerHTML = `
        <div class="shipping-loading">
            <span class="spinner"></span> Calculando frete...
        </div>`;

    // Cálculo local instantâneo (sem dependência de API externa)
    try {
        const options = calcularFreteLocal(cep);
        shippingOptions = options;
        renderizarOpcoesFrete(options);
    } catch (e) {
        container.innerHTML = `<p class="error-msg" style="font-size:0.8rem">Erro ao calcular frete. Tente novamente.</p>`;
    }
}

function renderizarOpcoesFrete(options) {
    const container = document.getElementById('shipping-options-container');
    if (!container) return;

    // Selecionar o mais barato por padrão (geralmente PAC)
    const defaultOption = options.reduce((prev, curr) => prev.valor < curr.valor ? prev : curr);
    currentShippingMethod = defaultOption.codigo;
    currentShippingCost = defaultOption.valor;

    container.innerHTML = `
        <span class="shipping-title">Escolha o Frete:</span>
        ${options.map(opt => {
            const precoTxt = opt.valor === 0 ? '<strong style="color:#34d399">Grátis</strong>' : opt.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const prazoTxt = opt.prazo === 0 ? 'Combinar retirada' : `Chega em até ${opt.prazo} dias úteis`;
            return `
            <div class="shipping-option ${opt.codigo === currentShippingMethod ? 'selected' : ''}" onclick="selecionarFrete('${opt.codigo}', ${opt.valor})">
                <input type="radio" name="shipping" value="${opt.codigo}" ${opt.codigo === currentShippingMethod ? 'checked' : ''}>
                <div class="shipping-info">
                    <div>
                        <div class="shipping-type">${escapeHtml(opt.nome)}</div>
                        <div class="shipping-time">${prazoTxt}</div>
                    </div>
                    <div class="shipping-price">${precoTxt}</div>
                </div>
            </div>`;
        }).join('')}
    `;

    // Mostrar a linha de frete no resumo
    const freteRow = document.querySelector('.frete-row');
    if (freteRow) freteRow.style.display = 'flex';

    atualizarTotalCheckout();
}

function selecionarFrete(codigo, valor) {
    currentShippingMethod = codigo;
    currentShippingCost = valor;
    
    // UI feedback
    document.querySelectorAll('.shipping-option').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input').value === codigo);
        el.querySelector('input').checked = (el.querySelector('input').value === codigo);
    });

    atualizarTotalCheckout();
}

function atualizarTotalCheckout() {
    const subtotal = totalCarrinho();
    const total = subtotal + currentShippingCost;
    
    const freteFmt = currentShippingCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const totalFmt = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    document.getElementById('checkout-frete-value').textContent = freteFmt;
    document.getElementById('checkout-total-value').textContent = totalFmt;
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
            <img src="${escapeHtml(item.imagem_url)}" alt="${escapeHtml(item.titulo)}" class="cart-item-img">
            <div class="cart-item-info">
                <strong>${escapeHtml(item.titulo)}</strong>
                <span class="tag-tamanho">${escapeHtml(item.tamanho)}</span>
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
    const subtotal = totalCarrinho();
    const subtotalFmt = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    currentShippingCost = 0; // Reset inicial
    currentShippingMethod = null;

    summaryEl.innerHTML = carrinho.map(item => {
        const pFmt = item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `
        <div class="summary-item">
            <img src="${escapeHtml(item.imagem_url)}" alt="${escapeHtml(item.titulo)}" class="summary-img">
            <div>
                <strong>${escapeHtml(item.titulo)}</strong><br>
                <span class="price">${pFmt}</span>
            </div>
        </div>`;
    }).join('') + `
    <div id="shipping-options-container" class="shipping-selector" style="display:none;"></div>
    <div class="summary-calculations">
        <div class="calc-row"><span>Subtotal:</span> <span>${subtotalFmt}</span></div>
        <div class="calc-row frete-row" style="display:none;"><span>Frete:</span> <span id="checkout-frete-value">R$ 0,00</span></div>
    </div>
    <div class="summary-total">
        <strong>Total:</strong>
        <span id="checkout-total-value" class="price">${subtotalFmt}</span>
    </div>`;
}

function fecharCheckout() {
    document.getElementById('checkout-overlay').style.display = 'none';
    document.getElementById('checkout-form').reset();
    document.getElementById('checkout-form').style.display = 'block';
    document.getElementById('checkout-error').style.display = 'none';
    document.getElementById('payment-section').style.display = 'none';
    document.getElementById('pix-qr-section').style.display = 'none';
    document.getElementById('payment-result').style.display = 'none';
    const payErr = document.getElementById('payment-error');
    if (payErr) payErr.style.display = 'none';
    if (pixPollingInterval) clearInterval(pixPollingInterval);
    customerData = null;
    currentPedidoId = null;
}

// Etapa 1: Validar dados do cliente e avançar para pagamento
async function processarPedido(event) {
    event.preventDefault();

    const btn = document.getElementById('btn-finalizar');
    const erroDisplay = document.getElementById('checkout-error');
    erroDisplay.style.display = 'none';

    const nome = document.getElementById('nome').value;
    const instagram = document.getElementById('instagram').value;
    const email = document.getElementById('email').value;
    const cpf = document.getElementById('cpf').value;
    const telefone = document.getElementById('telefone').value;
    const cep = document.getElementById('cep').value;
    const rua = document.getElementById('rua').value;
    const numero = document.getElementById('numero').value;
    const bairro = document.getElementById('bairro').value;
    const cidade = document.getElementById('cidade').value;
    const estado = document.getElementById('estado').value;

    const cpfClean = cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
        erroDisplay.textContent = "CPF Inválido.";
        erroDisplay.style.display = 'block';
        return;
    }
    if (carrinho.length === 0) {
        erroDisplay.textContent = "Seu carrinho está vazio.";
        erroDisplay.style.display = 'block';
        return;
    }

    if (!currentShippingMethod) {
        erroDisplay.textContent = "Por favor, informe seu CEP e selecione uma opção de frete.";
        erroDisplay.style.display = 'block';
        return;
    }

    customerData = { nome, instagram, email, cpf: cpfClean, telefone, cep, rua, numero, bairro, cidade, estado };

    // Preencher CPF no campo oculto do CardForm
    const cpfField = document.getElementById('form-checkout__identificationNumber');
    if (cpfField) cpfField.value = cpfClean;

    // Esconder formulário, mostrar métodos de pagamento
    document.getElementById('checkout-form').style.display = 'none';
    document.getElementById('payment-section').style.display = 'block';
    selecionarMetodoPagamento('pix');
}

// ----------------- SELEÇÃO DE MÉTODO ----------------- //

function selecionarMetodoPagamento(method) {
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-method="${method}"]`);
    if (btn) btn.classList.add('active');

    document.getElementById('pix-section').style.display = method === 'pix' ? 'block' : 'none';
    document.getElementById('card-section').style.display = method !== 'pix' ? 'block' : 'none';

    const payErr = document.getElementById('payment-error');
    if (payErr) payErr.style.display = 'none';

    if (method !== 'pix' && mpInstance) {
        // Destroy previous instance if exists to allow re-init
        if (cardFormInstance) {
            try { cardFormInstance.unmount(); } catch(e) { /* ignore */ }
            cardFormInstance = null;
        }
        // Wait for the container to be visible before mounting iframes
        setTimeout(() => { initCardForm(); }, 300);
    }
}

// ----------------- PIX ----------------- //

async function pagarComPix() {
    const btn = document.getElementById('btn-pagar-pix');
    const payErr = document.getElementById('payment-error');
    btn.disabled = true;
    btn.textContent = 'Gerando PIX...';
    payErr.style.display = 'none';

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-mp-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({
                customer: customerData,
                cart_items: carrinho,
                payment: { method: 'pix' },
                shipping_method: currentShippingMethod,
                shipping_cost: currentShippingCost,
                cep_destino: customerData.cep
            }),
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao gerar PIX.');

        currentPedidoId = data.pedido_id;

        // Mostrar QR Code
        document.getElementById('payment-section').style.display = 'none';
        document.getElementById('pix-qr-section').style.display = 'block';
        document.getElementById('pix-qr-image').src = 'data:image/png;base64,' + data.qr_code_base64;
        document.getElementById('pix-code').value = data.qr_code;
        document.getElementById('pix-status').textContent = 'Aguardando pagamento...';

        iniciarPollingPix(currentPedidoId);
    } catch (e) {
        payErr.textContent = e.message;
        payErr.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Gerar QR Code PIX';
}

function copiarCodigoPix() {
    const input = document.getElementById('pix-code');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        const btn = input.nextElementSibling;
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });
}

function iniciarPollingPix(pedidoId) {
    if (pixPollingInterval) clearInterval(pixPollingInterval);

    pixPollingInterval = setInterval(async () => {
        try {
            const { data } = await _supabase
                .from('pedidos')
                .select('status_pagamento')
                .eq('id', pedidoId)
                .single();

            if (data?.status_pagamento === 'aprovado') {
                clearInterval(pixPollingInterval);
                mostrarSucesso();
            } else if (data?.status_pagamento === 'rejeitado' || data?.status_pagamento === 'cancelado') {
                clearInterval(pixPollingInterval);
                mostrarErro('Pagamento nao aprovado.');
            }
        } catch (e) {
            console.error('Erro polling:', e);
        }
    }, 5000);

    // Timeout: parar polling após 30 min
    setTimeout(() => {
        if (pixPollingInterval) clearInterval(pixPollingInterval);
    }, 30 * 60 * 1000);
}

// ----------------- CARTÃO ----------------- //

function initCardForm() {
    if (!mpInstance) return;
    try {
        cardFormInstance = mpInstance.cardForm({
            amount: String(totalCarrinho()),
            iframe: true,
            form: {
                id: 'form-checkout',
                cardNumber: { id: 'form-checkout__cardNumber', placeholder: 'Numero do cartao' },
                expirationDate: { id: 'form-checkout__expirationDate', placeholder: 'MM/YY' },
                securityCode: { id: 'form-checkout__securityCode', placeholder: 'CVV' },
                cardholderName: { id: 'form-checkout__cardholderName' },
                issuer: { id: 'form-checkout__issuer' },
                installments: { id: 'form-checkout__installments' },
                identificationType: { id: 'form-checkout__identificationType' },
                identificationNumber: { id: 'form-checkout__identificationNumber' },
            },
            callbacks: {
                onFormMounted: (error) => { if (error) console.error('CardForm mount error:', error); },
                onSubmit: (event) => { event.preventDefault(); },
                onFetching: () => { },
            },
        });
    } catch (e) {
        console.error('Erro ao inicializar CardForm:', e);
    }
}

async function pagarComCartao() {
    const btn = document.getElementById('btn-pagar-cartao');
    const payErr = document.getElementById('payment-error');
    btn.disabled = true;
    btn.textContent = 'Processando...';
    payErr.style.display = 'none';

    try {
        if (!cardFormInstance) throw new Error('Formulario de cartao nao inicializado.');

        const cardFormData = cardFormInstance.getCardFormData();
        if (!cardFormData.token) throw new Error('Preencha os dados do cartao corretamente.');

        const response = await fetch(`${SUPABASE_URL}/functions/v1/create-mp-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({
                customer: customerData,
                cart_items: carrinho,
                payment: {
                    method: 'credit_card',
                    token: cardFormData.token,
                    installments: Number(cardFormData.installments) || 1,
                    issuer_id: cardFormData.issuerId,
                    payment_method_id: cardFormData.paymentMethodId,
                },
                shipping_method: currentShippingMethod,
                shipping_cost: currentShippingCost,
                cep_destino: customerData.cep
            }),
        });

        const data = await response.json();

        if (data.success && data.status === 'approved') {
            mostrarSucesso();
        } else if (data.status === 'rejected' || !data.success) {
            const msg = traduzirErroCartao(data.status_detail);
            payErr.textContent = msg;
            payErr.style.display = 'block';
        } else {
            // in_process / pending
            currentPedidoId = data.pedido_id;
            mostrarSucesso('Pagamento em processamento. Voce sera notificado por e-mail quando confirmado.');
        }
    } catch (e) {
        payErr.textContent = e.message;
        payErr.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Pagar com Cartao';
}

function traduzirErroCartao(statusDetail) {
    const erros = {
        'cc_rejected_bad_filled_card_number': 'Numero do cartao incorreto.',
        'cc_rejected_bad_filled_date': 'Data de validade incorreta.',
        'cc_rejected_bad_filled_other': 'Dados do cartao incorretos.',
        'cc_rejected_bad_filled_security_code': 'Codigo de seguranca incorreto.',
        'cc_rejected_blacklist': 'Pagamento nao autorizado.',
        'cc_rejected_call_for_authorize': 'Ligue para a operadora do cartao para autorizar.',
        'cc_rejected_card_disabled': 'Cartao desabilitado. Ligue para a operadora.',
        'cc_rejected_duplicated_payment': 'Pagamento duplicado.',
        'cc_rejected_high_risk': 'Pagamento recusado por seguranca.',
        'cc_rejected_insufficient_amount': 'Saldo insuficiente.',
        'cc_rejected_max_attempts': 'Limite de tentativas. Use outro cartao.',
        'cc_rejected_other_reason': 'Pagamento nao autorizado pela operadora.',
    };
    return erros[statusDetail] || 'Pagamento nao aprovado. Tente novamente ou use outro metodo.';
}

// ----------------- RESULTADO DO PAGAMENTO ----------------- //

function mostrarSucesso(mensagem) {
    document.getElementById('payment-section').style.display = 'none';
    document.getElementById('pix-qr-section').style.display = 'none';
    document.getElementById('payment-result').style.display = 'block';
    document.getElementById('payment-result-content').innerHTML = `
        <div class="payment-success">
            <div class="success-icon">&#10003;</div>
            <h3>Pagamento Confirmado!</h3>
            <p>${escapeHtml(mensagem || 'Suas pecas foram reservadas com sucesso.')}</p>
            <button class="btn-primary" onclick="fecharCheckoutFinal()">Voltar para a Vitrine</button>
        </div>`;
    limparCarrinho();
    carregarProdutos();
}

function mostrarErro(mensagem) {
    document.getElementById('pix-qr-section').style.display = 'none';
    document.getElementById('payment-result').style.display = 'block';
    document.getElementById('payment-result-content').innerHTML = `
        <div class="payment-error">
            <div class="error-icon">&#10007;</div>
            <h3>Pagamento nao concluido</h3>
            <p>${escapeHtml(mensagem)}</p>
            <button class="btn-primary" onclick="fecharCheckoutFinal()">Tentar Novamente</button>
        </div>`;
    carregarProdutos();
}

function fecharCheckoutFinal() {
    fecharCheckout();
    cardFormInstance = null;
}
