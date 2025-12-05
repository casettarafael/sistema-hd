// --- 1. CONFIGURAÇÃO DO SUPABASE ---
// COLE SUAS CHAVES AQUI
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

// Inicializa cliente (com _ para evitar conflito)
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let clientes = [];
let financeChartInstance = null;

// --- 2. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Sistema Iniciando...");
    setupMenuAndTheme();
    
    // Data Topo
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);

    // Carregar dados
    try {
        await carregarDadosDoBanco();
    } catch (e) {
        console.error("Erro fatal na inicialização:", e);
        alert("Erro ao conectar no banco de dados. Verifique o console (F12).");
    }
});

// --- 3. BANCO DE DADOS ---
async function carregarDadosDoBanco() {
    console.log("Buscando dados no Supabase...");
    
    const { data, error } = await _supabase
        .from('clientes')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error("Erro Supabase:", error);
        showToast("Erro ao ler dados: " + error.message, "red");
        return;
    }

    console.log("Dados recebidos:", data);
    clientes = data || [];

    if (clientes.length === 0) {
        console.log("Banco vazio.");
        // Removi o confirm automático para não travar o carregamento
    } else {
        renderizarTudo();
        renderizarGrafico();
    }
}

async function salvarCliente(clienteObj) {
    console.log("Tentando salvar:", clienteObj);
    let error = null;

    if (clienteObj.id) {
        // Atualizar
        const res = await _supabase.from('clientes')
            .update({ 
                nome: clienteObj.nome, 
                telefone: clienteObj.telefone, 
                historico: clienteObj.historico 
            })
            .eq('id', clienteObj.id);
        error = res.error;
    } else {
        // Inserir Novo (Sem ID, o banco cria sozinho)
        // IMPORTANTE: Removemos o ID se ele for undefined/null para o banco criar
        const novoCliente = {
            nome: clienteObj.nome,
            telefone: clienteObj.telefone, 
            historico: clienteObj.historico 
        };
        
        const res = await _supabase.from('clientes').insert([novoCliente]);
        error = res.error;
    }

    if (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro no Banco de Dados: " + error.message + "\n\nDica: Verifique se a tabela 'clientes' tem as colunas 'nome', 'telefone' e 'historico'.");
        return false;
    }
    
    console.log("Salvo com sucesso!");
    await carregarDadosDoBanco();
    return true;
}

// --- 4. FORMULÁRIO DE VENDA (AQUI ESTAVA O PROBLEMA PROVAVELMENTE) ---
document.getElementById('form-venda').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Botão salvar clicado!");

    const nome = document.getElementById('venda-nome').value;
    const tel = document.getElementById('venda-tel').value;
    const data = document.getElementById('venda-data').value;
    const tipo = document.getElementById('venda-tipo').value;
    const valor = document.getElementById('venda-valor').value;
    const obs = document.getElementById('venda-obs').value;

    const btn = document.querySelector('.btn-primary');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = 'Salvando...';
    btn.disabled = true;

    try {
        // Procura cliente na lista local (ignorando maiúsculas/minúsculas)
        let cliente = clientes.find(c => c.nome && c.nome.toLowerCase() === nome.toLowerCase());
        
        const servico = { data, servico: tipo, valor, obs };

        if (cliente) {
            console.log("Cliente existente encontrado:", cliente);
            // Garante que histórico existe
            if (!Array.isArray(cliente.historico)) cliente.historico = [];
            
            // Adiciona novo serviço no topo
            cliente.historico.unshift(servico);
            cliente.telefone = tel; // Atualiza telefone
            
            await salvarCliente(cliente);
            showToast("Histórico atualizado!");
        } else {
            console.log("Cliente novo:", nome);
            const novoCliente = { 
                nome: nome, 
                telefone: tel, 
                historico: [servico] 
            };
            await salvarCliente(novoCliente);
            showToast("Novo cliente salvo!");
        }

        document.getElementById('form-venda').reset();
        
        // Volta para o dashboard após 1 segundo
        setTimeout(() => {
            navegar('dashboard');
        }, 1000);

    } catch (err) {
        console.error("Erro no fluxo de salvar:", err);
        alert("Erro inesperado no código: " + err.message);
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
});

// --- 5. RENDERIZAÇÃO E OUTROS ---
function setupMenuAndTheme() {
    document.querySelectorAll('.menu-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navegar(link.id.replace('link-', '')); 
        });
    });

    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('checkbox').checked = true;
    }

    document.getElementById('checkbox').addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        renderizarGrafico();
    });
}

function navegar(telaId) {
    document.querySelectorAll('.menu-item').forEach(l => l.classList.remove('active'));
    const link = document.getElementById('link-' + telaId);
    if(link) link.classList.add('active');

    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    const view = document.getElementById('view-' + telaId);
    if(view) view.classList.remove('hidden');

    const titulos = {
        'dashboard': 'Visão Geral', 'vendas': 'Novo Serviço',
        'clientes': 'Base de Clientes', 'financeiro': 'Emissão de Recibos'
    };
    document.getElementById('page-title').innerText = titulos[telaId] || 'HD System';

    if (window.innerWidth <= 768) toggleSidebar();
    if (telaId === 'dashboard') renderizarGrafico();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function renderizarTudo() {
    const tabelaDash = document.getElementById('tabela-dashboard');
    const tabelaBase = document.getElementById('tabela-clientes-base');
    const datalist = document.getElementById('lista-clientes-sugestao');
    
    tabelaDash.innerHTML = '';
    tabelaBase.innerHTML = '';
    datalist.innerHTML = '';

    let kpi = { vencidos: 0, alerta: 0, receitaMes: 0 };
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    clientes.forEach(c => {
        const hist = Array.isArray(c.historico) ? c.historico : [];
        // Ordena histórico por data (segurança contra dados ruins)
        hist.sort((a, b) => {
            if(!a.data) return 1;
            if(!b.data) return -1;
            return new Date(b.data) - new Date(a.data)
        });
        
        const ultimaData = hist.length > 0 ? hist[0].data : null;
        const status = calcularStatus(ultimaData);

        if (status.st === 'vencido') kpi.vencidos++;
        else if (status.st === 'alerta') kpi.alerta++;

        hist.forEach(h => {
            if(h.data) {
                const dh = new Date(h.data);
                dh.setHours(dh.getHours() + 12);
                if (dh.getMonth() === mesAtual && dh.getFullYear() === anoAtual) {
                    kpi.receitaMes += parseFloat(h.valor || 0);
                }
            }
        });

        // Dashboard Row
        if (status.st !== 'ok') {
            const zap = `https://wa.me/55${c.telefone}?text=${encodeURIComponent(`Olá ${c.nome}, manutenção venceu.`)}`;
            tabelaDash.innerHTML += `
                <tr>
                    <td><strong>${c.nome}</strong></td>
                    <td><span class="status status-${status.st}">${status.txt}</span></td>
                    <td>${ultimaData ? formatarData(ultimaData) : '-'}</td>
                    <td><a href="${zap}" target="_blank" class="btn-whatsapp"><i class="fab fa-whatsapp"></i></a></td>
                </tr>`;
        }

        // Base Row
        tabelaBase.innerHTML += `
            <tr>
                <td>${c.nome}</td>
                <td>${c.telefone}</td>
                <td><button class="btn-hist" onclick="abrirHistorico(${c.id})">Ver</button></td>
            </tr>`;

        datalist.innerHTML += `<option value="${c.nome}">`;
    });

    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    const elFat = document.getElementById('kpi-faturamento');
    elFat.innerText = `R$ ${kpi.receitaMes.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    elFat.style.color = "#10b981";
}

function renderizarGrafico() {
    const ctx = document.getElementById('financeChart').getContext('2d');
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let labels = [], dados = [];
    const hoje = new Date();

    for(let i=5; i>=0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        labels.push(meses[d.getMonth()]);
        let total = 0;
        clientes.forEach(c => {
            const hist = Array.isArray(c.historico) ? c.historico : [];
            hist.forEach(h => {
                if(h.data) {
                    const dh = new Date(h.data);
                    dh.setHours(dh.getHours() + 12);
                    if(dh.getMonth() === d.getMonth()) total += parseFloat(h.valor || 0);
                }
            });
        });
        dados.push(total);
    }

    if(financeChartInstance) financeChartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const color = isDark ? '#fff' : '#2c3e50';
    
    financeChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Faturamento', data: dados, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color } } },
            scales: {
                y: { ticks: { color }, grid: { color: isDark ? '#333' : '#eee' } },
                x: { ticks: { color }, grid: { display: false } }
            }
        }
    });
}

// Utils
function calcularStatus(d) {
    if (!d) return { st: 'novo', txt: 'Novo' };
    const p = new Date(d); p.setFullYear(p.getFullYear() + 1);
    const diff = Math.ceil((p - new Date()) / 86400000);
    if (diff <= 0) return { st: 'vencido', txt: `Vencido ${Math.abs(diff)}d` };
    if (diff <= 30) return { st: 'alerta', txt: `Vence ${diff}d` };
    return { st: 'ok', txt: 'Em dia' };
}
function formatarData(d) { const dt = new Date(d); dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset()); return dt.toLocaleDateString('pt-BR'); }
function formatarTel(t) { return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }
function showToast(msg, color="green") { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = color === "red" ? "#e74c3c" : "#10b981"; t.className = "toast show"; setTimeout(() => t.className = "toast", 3000); }

async function carregarDadosFicticios() {
    function gd(d) { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0]; }
    const mocks = [
        { nome: "Construtora Exemplo", telefone: "11999998888", historico: [{ data: gd(0), servico: "Instalação", valor: 4500, obs: "Teste" }] },
        { nome: "Cliente Antigo", telefone: "11988887777", historico: [{ data: gd(-370), servico: "Manutenção", valor: 350, obs: "Vencido" }] }
    ];
    await _supabase.from('clientes').insert(mocks);
    window.location.reload();
}

window.abrirHistorico = (id) => {
    const c = clientes.find(x => x.id === id);
    if(!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome;
    // document.getElementById('modal-tel').innerText = formatarTel(c.telefone); 
    let total = 0; const tl = document.getElementById('modal-timeline'); tl.innerHTML = '';
    const hist = Array.isArray(c.historico) ? c.historico : [];
    hist.forEach(h => {
        total += parseFloat(h.valor || 0);
        tl.innerHTML += `<div class="timeline-item"><span class="t-date">${formatarData(h.data)}</span><span class="t-title">${h.servico}</span><span class="t-val">R$ ${parseFloat(h.valor).toFixed(2)}</span></div>`;
    });
    document.getElementById('modal-total').innerText = `R$ ${total.toFixed(2)}`;
    document.getElementById('modal-historico').classList.remove('hidden');
};
window.fecharModal = (id) => document.getElementById(id).classList.add('hidden');
window.gerarRecibo = () => {
    document.getElementById('print-nome').innerText = document.getElementById('rec-nome').value;
    document.getElementById('print-valor').innerText = document.getElementById('rec-valor').value;
    document.getElementById('print-desc').innerText = document.getElementById('rec-desc').value;
    document.getElementById('print-data').innerText = new Date().toLocaleDateString();
    document.getElementById('modal-recibo').classList.remove('hidden');
};
window.exportarCSV = () => alert("Backup em desenvolvimento.");
window.filtrarClientes = () => {
    const termo = document.getElementById('busca-cliente').value.toLowerCase();
    document.querySelectorAll('#tabela-clientes-base tr').forEach(tr => {
        tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none';
    });
};