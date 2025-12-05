// --- 1. DADOS E CONFIGURAÇÃO (AGORA COM LUCRO NO MÊS ATUAL) ---
const dbInicial = [
    // 1. VENDA RECENTE (HOJE) - Para garantir Faturamento Positivo no Dashboard
    {
        id: 101,
        nome: "Construtora Alto Padrão",
        telefone: "11999998888",
        historico: [
            { data: gerarData(0), servico: "Instalação Bateria de Aquecedores", valor: 4500.00, obs: "Instalação sistema conjugado (Boiler + Gás)." }
        ]
    },
    // 2. VENDA RECENTE (ONTEM)
    {
        id: 102,
        nome: "Academia BlueFit",
        telefone: "11988887777",
        historico: [
            { data: gerarData(-2), servico: "Manutenção Preventiva", valor: 850.00, obs: "Contrato mensal de manutenção." },
            { data: gerarData(-380), servico: "Instalação Nova", valor: 3200.00, obs: "Instalação antiga." }
        ]
    },
    // 3. VENDA (Semana Passada)
    {
        id: 103,
        nome: "Sra. Helena (Cobertura)",
        telefone: "11977776666",
        historico: [
            { data: gerarData(-5), servico: "Visita Técnica + Peças", valor: 500.00, obs: "Troca de placa eletrônica." }
        ]
    },
    // 4. CLIENTE VENCIDO (Vermelho)
    {
        id: 1, 
        nome: "Condomínio Solar das Águas", 
        telefone: "11998765432",
        historico: [
            { data: gerarData(-400), servico: "Instalação Coletiva", valor: 2500.00, obs: "Instalação inicial." }
        ]
    },
    // 5. CLIENTE ALERTA (Amarelo)
    {
        id: 2, 
        nome: "Restaurante La Mamma", 
        telefone: "11955554444",
        historico: [
            { data: gerarData(-350), servico: "Manutenção Corretiva", valor: 450.00, obs: "Troca de ventoinha." }
        ]
    },
    // 6. CLIENTE ANTIGO (Histórico Rico)
    {
        id: 6,
        nome: "Hotel Plaza Inn",
        telefone: "11933332222",
        historico: [
            { data: gerarData(-30), servico: "Manutenção Preventiva", valor: 1200.00, obs: "Manutenção mensal." },
            { data: gerarData(-60), servico: "Manutenção Preventiva", valor: 1200.00, obs: "Manutenção mensal." },
            { data: gerarData(-90), servico: "Manutenção Preventiva", valor: 1200.00, obs: "Manutenção mensal." }
        ]
    }
];

// Carrega do LocalStorage ou usa o DB Fictício acima
// Mudei a chave para 'hd_pro_v3_lucro' para forçar atualização
let clientes = JSON.parse(localStorage.getItem('hd_pro_v3_lucro')) || dbInicial;
let financeChartInstance = null;

// --- 2. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // Carregar tema
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme) {
        document.documentElement.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dark') document.getElementById('checkbox').checked = true;
    }

    // Data Topo
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);

    // Renderiza tudo
    renderizarTudo();
    renderizarGrafico();
});

// --- 3. FUNÇÕES PRINCIPAIS ---
function renderizarTudo() {
    const tabelaDash = document.getElementById('tabela-dashboard');
    const tabelaBase = document.getElementById('tabela-clientes-base');
    const datalist = document.getElementById('lista-clientes-sugestao');
    
    tabelaDash.innerHTML = '';
    tabelaBase.innerHTML = '';
    datalist.innerHTML = '';

    let kpi = { vencidos: 0, alerta: 0, receitaMes: 0 };
    const dataHoje = new Date();
    const mesAtual = dataHoje.getMonth();
    const anoAtual = dataHoje.getFullYear();

    clientes.forEach(c => {
        // Ordena histórico (mais recente primeiro)
        c.historico.sort((a, b) => new Date(b.data) - new Date(a.data));
        const ultimaData = c.historico.length > 0 ? c.historico[0].data : null;
        const status = calcularStatus(ultimaData);

        // KPIs de Status (Vencidos/Alertas)
        if (status.status === 'vencido') kpi.vencidos++;
        else if (status.status === 'alerta') kpi.alerta++;

        // CÁLCULO DE RECEITA DO MÊS (IMPORTANTE)
        c.historico.forEach(h => {
            const dataServico = new Date(h.data);
            // Ajuste simples de fuso para garantir que 'hoje' caia no mês certo
            dataServico.setHours(dataServico.getHours() + 12); 

            if (dataServico.getMonth() === mesAtual && dataServico.getFullYear() === anoAtual) {
                kpi.receitaMes += parseFloat(h.valor || 0);
            }
        });

        // Preenche Tabela Dashboard (Prioridade para quem precisa de atenção)
        if (status.status !== 'ok') {
            const linkZap = `https://wa.me/55${c.telefone}?text=${encodeURIComponent(`Olá ${c.nome}, somos da HD Aquecedores. Consta em nosso sistema que sua manutenção preventiva venceu em ${status.vencimento}. Vamos agendar para garantir a segurança?`)}`;
            
            tabelaDash.innerHTML += `
                <tr>
                    <td>
                        <strong>${c.nome}</strong><br>
                        <small style="color:var(--text-muted)">${c.telefone}</small>
                    </td>
                    <td><span class="status status-${status.status}">${status.texto}</span></td>
                    <td>${ultimaData ? formatarData(ultimaData) : '-'}</td>
                    <td><a href="${linkZap}" target="_blank" class="btn-whatsapp"><i class="fab fa-whatsapp"></i> Avisar</a></td>
                </tr>
            `;
        }

        // Preenche Tabela Base (Todos os clientes)
        tabelaBase.innerHTML += `
            <tr>
                <td>${c.nome}</td>
                <td>${formatarTel(c.telefone)}</td>
                <td>
                    ${ultimaData ? formatarData(ultimaData) : '-'}
                    ${status.status !== 'ok' ? `<span style="width:8px; height:8px; background:${status.status === 'vencido' ? '#e74c3c' : '#f39c12'}; border-radius:50%; display:inline-block; margin-left:5px;"></span>` : ''}
                </td>
                <td><button class="btn-hist" onclick="abrirHistorico(${c.id})"><i class="fas fa-eye"></i> Ver</button></td>
            </tr>
        `;

        datalist.innerHTML += `<option value="${c.nome}">`;
    });

    // Atualiza KPIs Tela
    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    
    // FORMATAÇÃO DO FATURAMENTO (VERDE E GRANDE)
    const elFat = document.getElementById('kpi-faturamento');
    elFat.innerText = `R$ ${kpi.receitaMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    elFat.style.color = "#10b981"; // Força cor verde
}

// --- 4. GRÁFICO (CHART.JS) ---
function renderizarGrafico() {
    const ctx = document.getElementById('financeChart').getContext('2d');
    
    const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let labels = [];
    let dados = [];
    
    const hoje = new Date();
    // Gera últimos 6 meses
    for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        labels.push(mesesNomes[d.getMonth()]);
        
        let totalMes = 0;
        clientes.forEach(c => {
            c.historico.forEach(h => {
                const dh = new Date(h.data);
                dh.setHours(dh.getHours() + 12);
                if (dh.getMonth() === d.getMonth() && dh.getFullYear() === d.getFullYear()) {
                    totalMes += parseFloat(h.valor || 0);
                }
            });
        });
        dados.push(totalMes);
    }

    if (financeChartInstance) financeChartInstance.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const colorText = isDark ? '#e5e7eb' : '#374151';
    const colorGrid = isDark ? '#374151' : '#e5e7eb';

    financeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento (R$)',
                data: dados,
                borderColor: '#10b981', // Verde para indicar lucro
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.5)'); // Verde transparente
                    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
                    return gradient;
                },
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#10b981',
                pointRadius: 5,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: colorText, font: {family: 'Inter'} } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function(context) {
                            return 'R$ ' + context.parsed.y.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: colorText, callback: (val) => 'R$ ' + val },
                    grid: { color: colorGrid, borderDash: [5, 5] }
                },
                x: {
                    ticks: { color: colorText },
                    grid: { display: false }
                }
            }
        }
    });
}

// --- 5. LÓGICA DE SERVIÇO/VENDA ---
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

    salvarLocal();
    showToast(`Faturamento atualizado! Venda de R$ ${valor} registrada.`);
    document.getElementById('form-venda').reset();
    document.getElementById('menu-dashboard').click();
});

// --- 6. RECIBO ---
function gerarRecibo() {
    const nome = document.getElementById('rec-nome').value;
    const valor = parseFloat(document.getElementById('rec-valor').value).toLocaleString('pt-BR', {minimumFractionDigits: 2});
    const desc = document.getElementById('rec-desc').value;

    document.getElementById('print-nome').innerText = nome;
    document.getElementById('print-valor').innerText = `R$ ${valor}`;
    document.getElementById('print-desc').innerText = desc;
    document.getElementById('print-data').innerText = new Date().toLocaleDateString('pt-BR');

    abrirModal('modal-recibo');
}

// --- 7. UTILITÁRIOS ---
function salvarLocal() {
    localStorage.setItem('hd_pro_v3_lucro', JSON.stringify(clientes));
    renderizarTudo();
    renderizarGrafico();
}

function gerarData(dias) {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().split('T')[0];
}

function calcularStatus(dataUltima) {
    if (!dataUltima) return { status: 'novo', texto: 'Novo', vencimento: '-' };
    
    const ultima = new Date(dataUltima);
    ultima.setMinutes(ultima.getMinutes() + ultima.getTimezoneOffset());

    const proxima = new Date(ultima);
    proxima.setFullYear(proxima.getFullYear() + 1);
    
    const hoje = new Date();
    const diff = Math.ceil((proxima - hoje) / (1000 * 60 * 60 * 24));
    
    const vencimentoFormatado = proxima.toLocaleDateString('pt-BR');

    if (diff <= 0) return { status: 'vencido', texto: `Vencido (${Math.abs(diff)}d)`, vencimento: vencimentoFormatado };
    if (diff <= 30) return { status: 'alerta', texto: `Vence em ${diff}d`, vencimento: vencimentoFormatado };
    return { status: 'ok', texto: 'Em dia', vencimento: vencimentoFormatado };
}

function formatarData(d) { 
    const date = new Date(d);
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return date.toLocaleDateString('pt-BR'); 
}

function formatarTel(t) { return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }

// Modais
window.abrirHistorico = function(id) {
    const c = clientes.find(x => x.id === id);
    if (!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome;
    document.getElementById('modal-tel').innerText = formatarTel(c.telefone);
    document.getElementById('modal-btn-zap').href = `https://wa.me/55${c.telefone}`;
    
    let total = 0;
    const tl = document.getElementById('modal-timeline');
    tl.innerHTML = '';
    
    c.historico.forEach(h => {
        total += parseFloat(h.valor || 0);
        tl.innerHTML += `
            <div class="timeline-item">
                <span class="t-date">${formatarData(h.data)}</span>
                <span class="t-title">${h.servico}</span>
                <p style="font-size:0.85rem; color:var(--text-muted);">${h.obs}</p>
                <span class="t-val">R$ ${parseFloat(h.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
            </div>`;
    });
    document.getElementById('modal-total').innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('modal-qtd').innerText = c.historico.length;
    abrirModal('modal-historico');
}

window.abrirModal = (id) => { document.getElementById(id).classList.remove('hidden'); }
window.fecharModal = (id) => { document.getElementById(id).classList.add('hidden'); }

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
        
        const id = link.id;
        if(id === 'menu-dashboard') { document.getElementById('view-dashboard').classList.remove('hidden'); titulo.innerText = 'Visão Geral'; renderizarGrafico(); }
        else if(id === 'menu-vendas') { document.getElementById('view-vendas').classList.remove('hidden'); titulo.innerText = 'Novo Serviço'; document.getElementById('venda-data').valueAsDate = new Date(); }
        else if(id === 'menu-clientes') { document.getElementById('view-clientes').classList.remove('hidden'); titulo.innerText = 'Base de Clientes'; }
        else if(id === 'menu-financeiro') { document.getElementById('view-financeiro').classList.remove('hidden'); titulo.innerText = 'Gerador de Recibos'; }
        
        if(window.innerWidth <= 768) toggleMenu();
    });
});

window.toggleMenu = () => {
    document.getElementById('sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

const toggleSwitch = document.getElementById('checkbox');
toggleSwitch.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
    renderizarGrafico();
});

window.exportarCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,Nome,Telefone,Data Servico,Tipo,Valor\n";
    clientes.forEach(c => {
        c.historico.forEach(h => {
            csvContent += `${c.nome},${c.telefone},${h.data},${h.servico},${h.valor}\n`;
        });
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "hd_dados_backup.csv");
    document.body.appendChild(link);
    link.click();
}

window.resetarSistema = () => {
    if(confirm("Deseja apagar todos os dados e voltar para o modo demonstração?")) { 
        localStorage.removeItem('hd_pro_v3_lucro'); 
        location.reload(); 
    }
}

function showToast(msg) {
    const x = document.getElementById("toast");
    x.innerText = msg;
    x.className = "toast show";
    setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}

window.filtrarClientes = function() {
    const termo = document.getElementById('busca-cliente').value.toLowerCase();
    document.querySelectorAll('#tabela-clientes-base tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
}