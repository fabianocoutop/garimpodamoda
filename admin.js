// ===== CONFIGURAÇÃO SUPABASE =====
const SUPABASE_URL = 'https://rjjbxpssymaauqzpooig.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqamJ4cHNzeW1hYXVxenBvb2lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjQzMDcsImV4cCI6MjA5MDc0MDMwN30.595t4Df-jcn2JkZhKWVgb5E7pOjv2hj7_5eAba3PidQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let fotoSelecionada = null;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        mostrarPainel(session.user);
    }

    _supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            mostrarPainel(session.user);
        } else if (event === 'SIGNED_OUT') {
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('admin-panel').style.display = 'none';
        }
    });
});

// ===== AUTH =====
async function fazerLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const senha = document.getElementById('admin-password').value;
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';

    if (!email || !senha) {
        errEl.textContent = 'Preencha o e-mail e a senha.';
        errEl.style.display = 'block';
        return;
    }

    const btn = document.querySelector('.btn-login');
    btn.textContent = 'Entrando...';
    btn.disabled = true;

    const { error } = await _supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
        errEl.textContent = 'E-mail ou senha incorretos. Tente novamente.';
        errEl.style.display = 'block';
        btn.textContent = 'Entrar no Painel';
        btn.disabled = false;
    }
}

async function fazerLogout() {
    await _supabase.auth.signOut();
}

function mostrarPainel(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('admin-user-email').textContent = user.email;
    carregarProdutos();
}

// Entrar com Enter
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
        fazerLogin();
    }
});

// ===== PREVIEW FOTO =====
function previewFoto(input) {
    const file = input.files[0];
    if (!file) return;

    fotoSelecionada = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        const area = document.getElementById('upload-area');
        const placeholder = document.getElementById('upload-placeholder');
        const preview = document.getElementById('foto-preview');

        area.classList.add('has-image');
        placeholder.style.display = 'none';
        preview.style.display = 'block';
        preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ===== PUBLICAR PRODUTO =====
async function publicarProduto() {
    const titulo = document.getElementById('novo-titulo').value.trim();
    const descricao = document.getElementById('nova-descricao').value.trim();
    const preco = parseFloat(document.getElementById('novo-preco').value);
    const tamanho = document.getElementById('novo-tamanho').value;

    const feedback = document.getElementById('form-feedback');
    feedback.style.display = 'none';
    feedback.className = 'form-feedback';

    if (!titulo) {
        mostrarFeedback('error', '❌ O título da peça é obrigatório.');
        return;
    }
    if (isNaN(preco) || preco <= 0) {
        mostrarFeedback('error', '❌ Informe um preço válido para a peça.');
        return;
    }

    const btn = document.getElementById('btn-publicar');
    btn.innerHTML = '<div class="spinner"></div> Publicando...';
    btn.disabled = true;

    try {
        let imagem_url = '';

        // 1. Fazer upload da foto se selecionada
        if (fotoSelecionada) {
            const ext = fotoSelecionada.name.split('.').pop();
            const nomeArquivo = `produto_${Date.now()}.${ext}`;

            const { data: uploadData, error: uploadError } = await _supabase.storage
                .from('produtos-imagens')
                .upload(nomeArquivo, fotoSelecionada, {
                    contentType: fotoSelecionada.type,
                    upsert: false
                });

            if (uploadError) throw new Error('Falha no upload da foto: ' + uploadError.message);

            const { data: urlData } = _supabase.storage
                .from('produtos-imagens')
                .getPublicUrl(uploadData.path);

            imagem_url = urlData.publicUrl;
        }

        // 2. Inserir produto no banco
        const { data, error } = await _supabase.from('produtos').insert({
            titulo,
            descricao,
            preco,
            tamanho,
            imagem_url,
            disponivel: true
        }).select().single();

        if (error) throw new Error('Erro ao salvar produto: ' + error.message);

        mostrarFeedback('success', '✅ Peça publicada na vitrine com sucesso!');
        limparFormulario();
        carregarProdutos();

    } catch (e) {
        mostrarFeedback('error', '❌ ' + e.message);
    }

    btn.innerHTML = '<span>🚀</span> Publicar na Vitrine';
    btn.disabled = false;
}

function mostrarFeedback(tipo, msg) {
    const el = document.getElementById('form-feedback');
    el.textContent = msg;
    el.className = 'form-feedback ' + tipo;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function limparFormulario() {
    document.getElementById('novo-titulo').value = '';
    document.getElementById('nova-descricao').value = '';
    document.getElementById('novo-preco').value = '';
    document.getElementById('novo-tamanho').value = 'M';
    document.getElementById('upload-placeholder').style.display = 'block';
    document.getElementById('foto-preview').style.display = 'none';
    document.getElementById('foto-preview').src = '';
    document.getElementById('upload-area').classList.remove('has-image');
    document.getElementById('foto-input').value = '';
    fotoSelecionada = null;
}

// ===== LISTAR PRODUTOS =====
async function carregarProdutos() {
    const lista = document.getElementById('lista-produtos');
    lista.innerHTML = '<div class="loading-admin">🔄 Carregando...</div>';

    const { data, error } = await _supabase
        .from('produtos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        lista.innerHTML = `<div class="empty-state"><p>⚠️</p><span>Erro ao carregar: ${error.message}</span></div>`;
        return;
    }

    document.getElementById('total-badge').textContent = data.length + ' peças';

    if (data.length === 0) {
        lista.innerHTML = '<div class="empty-state"><p>👗</p><span>Nenhuma peça cadastrada ainda.<br>Adicione a primeira usando o formulário ao lado!</span></div>';
        return;
    }

    lista.innerHTML = '';
    data.forEach(p => {
        const precoFmt = p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const statusBadge = p.disponivel
            ? '<span class="badge-status-ok">● Disponível</span>'
            : '<span class="badge-status-sold">● Vendida</span>';
        const imgSrc = p.imagem_url || 'https://via.placeholder.com/80x80?text=Sem+foto';

        const card = document.createElement('div');
        card.className = 'product-admin-card' + (p.disponivel ? '' : ' unavailable');
        card.innerHTML = `
            <img src="${imgSrc}" class="product-admin-img" alt="${p.titulo}" onerror="this.src='https://via.placeholder.com/80x80?text=Sem+foto'">
            <div class="product-admin-info">
                <h3>${p.titulo}</h3>
                <p>${p.descricao ? p.descricao.substring(0, 60) + (p.descricao.length > 60 ? '...' : '') : 'Sem descrição'}</p>
                <div class="product-admin-price">${precoFmt}</div>
                <div class="product-badges">
                    <span class="badge-tamanho">${p.tamanho || 'U'}</span>
                    ${statusBadge}
                </div>
            </div>
            <div class="product-actions">
                ${p.disponivel
                    ? `<button class="btn-action desativar" onclick="toggleDisponivel(${p.id}, false)">🔒 Ocultar</button>`
                    : `<button class="btn-action reativar" onclick="toggleDisponivel(${p.id}, true)">✅ Reativar</button>`
                }
                <button class="btn-action deletar" onclick="deletarProduto(${p.id}, '${p.imagem_url || ''}')">🗑 Apagar</button>
            </div>
        `;
        lista.appendChild(card);
    });
}

// ===== TOGGLE DISPONIBILIDADE =====
async function toggleDisponivel(id, novoStatus) {
    const { error } = await _supabase
        .from('produtos')
        .update({ disponivel: novoStatus })
        .eq('id', id);

    if (error) {
        alert('Erro ao atualizar: ' + error.message);
        return;
    }
    carregarProdutos();
}

// ===== DELETAR PRODUTO =====
async function deletarProduto(id, imagemUrl) {
    if (!confirm('Tem certeza que deseja APAGAR esta peça permanentemente?\n\nEsta ação não pode ser desfeita!')) return;

    // Apagar imagem do storage se houver
    if (imagemUrl && imagemUrl.includes('produtos-imagens')) {
        const path = imagemUrl.split('/produtos-imagens/')[1];
        if (path) {
            await _supabase.storage.from('produtos-imagens').remove([path]);
        }
    }

    const { error } = await _supabase.from('produtos').delete().eq('id', id);
    if (error) {
        alert('Erro ao apagar: ' + error.message);
        return;
    }
    carregarProdutos();
}
