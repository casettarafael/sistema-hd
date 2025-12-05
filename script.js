// --- DADOS INICIAIS (Se estiver vazio) ---
const dbInicial = [
    {
        id: 1,
        nome: "Condomínio Jardins",
        telefone: "11999999999",
        historico: [
            { data: gerarData(-380), servico: "Instalação Nova", valor: 1200, obs: "Instalação completa" }
        ]
    },
    {
        id: 2,
        nome: "Padaria do Centro",
        telefone: "11988888888",
        historico: [
            { data: gerarData(-30), servico: "Manutenção Preventiva", valor: 350, obs: "Revisão anual" }
        ]
    }
];

let clientes = JSON.parse(localStorage.getItem('hd_mobile_v3')) || dbInicial;

// --- FUNÇÕES DE MENU MOBILE ---
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

// Fecha o menu se clicar no overlay (fundo escuro)
document.querySelector('.sidebar-overlay').addEventListener('click', toggleMenu);


// --- LÓGICA DO SISTEMA ---
function gerarData(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

function salvarDados() {
    localStorage.setItem('hd_mobile_v3', JSON.stringify(clientes));
    renderizarTudo();
}

function calcularStatus(dataUltima) {
    if (!dataUltima) return { status: 'novo', texto: 'Novo' };
    const ultima = new Date(dataUltima);
    const proxima = new Date(ultima);
    proxima.setFullYear(proxima.getFullYear() + 1);
    const hoje = new Date();
    const diffDays = Math.ceil((proxima - hoje) / (1000 * 60 * 60 * 24)); 

    if (diffDays <= 0) return { status: 'vencido', texto: `Vencido (${Math.abs(diffDays)}d)` };
    if (diffDays <= 30) return { status: 'alerta', texto: `Vence em ${diffDays}d` };
    return { status: 'ok', texto: 'Em dia' };
}

function renderizarTudo() {
    const tabelaDash = document.getElementById('tabela-dashboard');
    const tabelaBase = document.getElementById('tabela-clientes-base');
    const datalist = document.getElementById('lista-clientes-sugestao');
    
    tabelaDash.innerHTML = '';
    tabelaBase.innerHTML = '';
    datalist.innerHTML = '';

    let kpi = { vencidos: 0, alerta: 0, ok: 0 };

    clientes.forEach(c => {
        c.historico.sort((a, b) => new Date(b.data) - new Date(a.data));
        const ultimaData = c.historico.length > 0 ? c.historico[0].data : null;
        const status = calcularStatus(ultimaData);

        if (status.status === 'vencido') kpi.vencidos++;
        else if (status.status === 'alerta') kpi.alerta++;
        else kpi.ok++;

        // Render Dashboard
        const linkZap = `https://wa.me/55${c.telefone}?text=${encodeURIComponent(`Olá ${c.nome}, sua manutenção venceu. Vamos agendar?`)}`;
        
        // Só mostra no Dashboard se tiver alerta ou vencido (ou se quiser mostrar tudo)
        tabelaDash.innerHTML += `
            <tr>
                <td><strong>${c.nome}</strong></td>
                <td><span class="status status-${status.status}">${status.texto}</span></td>
                <td>${ultimaData ? new Date(ultimaData).toLocaleDateString('pt-BR') : '-'}</td>
                <td>${status.status !== 'ok' ? `<a href="${linkZap}" target="_blank" class="btn-zap"><i class="fab fa-whatsapp"></i> Cobrar</a>` : '<span style="color:#ccc; font-size:0.8rem">-</span>'}</td>
            </tr>
        `;

        // Render Base Completa
        tabelaBase.innerHTML += `
            <tr>
                <td>${c.nome}</td>
                <td>${c.telefone}</td>
                <td>${ultimaData ? new Date(ultimaData).toLocaleDateString('pt-BR') : '-'}</td>
                <td><button class="btn-hist" onclick="abrirHistorico(${c.id})"><i class="fas fa-eye"></i></button></td>
            </tr>
        `;

        datalist.innerHTML += `<option value="${c.nome}">`;
    });

    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    document.getElementById('kpi-ok').innerText = kpi.ok;
}

// Registrar Venda
document.getElementById('form-venda').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('venda-nome').value;
    const tel = document.getElementById('venda-tel').value;
    const data = document.getElementById('venda-data').value;
    const tipo = document.getElementById('venda-tipo').value;
    const valor = document.getElementById('venda-valor').value;
    const obs = document.getElementById('venda-obs').value;

    let cliente = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
    const servico = { data, servico: tipo, valor, obs };

    if (cliente) {
        cliente.historico.unshift(servico);
        cliente.telefone = tel;
    } else {
        clientes.push({ id: Date.now(), nome, telefone: tel, historico: [servico] });
    }

    salvarDados();
    document.getElementById('form-venda').reset();
    alert('Salvo com sucesso!');
    // Ir para Dashboard
    document.getElementById('menu-dashboard').click();
});

// Modal e Reset
window.abrirHistorico = function(id) {
    const cliente = clientes.find(c => c.id === id);
    if (!cliente) return;
    document.getElementById('modal-nome-cliente').innerText = cliente.nome;
    document.getElementById('modal-tel').innerText = cliente.telefone;
    
    let total = 0;
    const tl = document.getElementById('modal-timeline');
    tl.innerHTML = '';
    
    cliente.historico.forEach(h => {
        total += parseFloat(h.valor || 0);
        tl.innerHTML += `
            <div class="timeline-item">
                <span class="t-date">${new Date(h.data).toLocaleDateString('pt-BR')}</span>
                <span class="t-title">${h.servico}</span>
                <p style="font-size:0.85rem; color:#666;">${h.obs}</p>
                <span style="font-weight:bold; color:var(--green)">R$ ${h.valor}</span>
            </div>
        `;
    });
    document.getElementById('modal-total').innerText = total.toFixed(2);
    document.getElementById('modal-historico').classList.remove('hidden');
}

window.fecharModal = function() { document.getElementById('modal-historico').classList.add('hidden'); }

window.resetarSistema = function() {
    if(confirm("Apagar tudo?")) { localStorage.removeItem('hd_mobile_v3'); location.reload(); }
}

// Navegação
const links = document.querySelectorAll('.sidebar nav a');
const views = document.querySelectorAll('.view-section');
const titulo = document.getElementById('page-title');

links.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        views.forEach(v => v.classList.add('hidden'));
        
        if(link.id === 'menu-dashboard') {
            document.getElementById('view-dashboard').classList.remove('hidden');
            titulo.innerText = 'Visão Geral';
        } else if(link.id === 'menu-vendas') {
            document.getElementById('view-vendas').classList.remove('hidden');
            titulo.innerText = 'Nova Venda';
            document.getElementById('venda-data').valueAsDate = new Date();
        } else {
            document.getElementById('view-clientes').classList.remove('hidden');
            titulo.innerText = 'Clientes';
        }
    });
});

// Busca
window.filtrarClientes = function() {
    const termo = document.getElementById('busca-cliente').value.toLowerCase();
    document.querySelectorAll('#tabela-clientes-base tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
}

// Iniciar
document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR');
salvarDados();