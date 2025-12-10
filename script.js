// --- CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIÁVEIS GLOBAIS ---
let clientes = []; 
let leads = []; 
let financeChartInstance = null;
let periodoGrafico = 6;

// Paginação Aba Clientes
let paginaAtualClientes = 0;
const itensPorPagina = 10;
let timeoutBusca = null;

// Paginação Dashboard (Lista Vencidos)
let listaManutencoesDash = [];
let paginaAtualDash = 0;
const itensPorPaginaDash = 20;

// --- INICIALIZAÇÃO (LOGIN & SISTEMA) ---
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        mostrarLogin();
    } else {
        iniciarSistema();
    }
});

function mostrarLogin() {
    const modal = document.getElementById('modal-login');
    if(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; 
    }
}

const formLogin = document.getElementById('form-login');
if(formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-senha').value;
        const btn = formLogin.querySelector('button');
        const txtOriginal = btn.innerText;
        btn.innerText = "Entrando..."; btn.disabled = true;

        const { error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) {
            alert("Erro: " + error.message);
            btn.innerText = txtOriginal; btn.disabled = false;
        } else {
            iniciarSistema();
        }
    });
}

// --- SISTEMA PRINCIPAL ---
async function iniciarSistema() {
    const modal = document.getElementById('modal-login');
    if(modal) modal.classList.add('hidden');
    document.body.style.overflow = 'auto';

    setupMenuAndTheme();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);
    
    try { 
        await carregarDadosDoBanco(); // Carrega Dashboard e Faturamento
        await carregarLeads();        
        await carregarTabelaClientes(); // Carrega tabela clientes paginada
    } catch (e) { 
        console.error("Erro start:", e);
    }
}

window.fazerLogout = async () => {
    if(confirm("Deseja realmente sair?")) {
        await _supabase.auth.signOut();
        window.location.reload();
    }
}

// --- DASHBOARD: KPIs, GRÁFICO E LISTA ---
async function carregarDadosDoBanco() {
    const { data, error } = await _supabase.from('clientes').select('*').order('id', { ascending: false });
    if (error) { console.error("Erro RLS:", error); return; }
    clientes = data || [];
    
    calcularKPIsERenderizarDash();
    renderizarGrafico();
    atualizarTotalClientes(); 
}

function calcularKPIsERenderizarDash() {
    const dl = document.getElementById('lista-clientes-sugestao');
    if(dl) dl.innerHTML = '';
    
    let kpi = { vencidos: 0, alerta: 0, receita: 0, negociacao: 0 };
    listaManutencoesDash = []; // Reseta lista

    clientes.forEach(c => {
        const hist = Array.isArray(c.historico) ? c.historico : [];
        hist.sort((a, b) => new Date(b.data||0) - new Date(a.data||0));
        
        const ult = hist.length > 0 ? hist[0] : null;
        const ultData = ult ? ult.data : null;
        const ultTipo = ult ? ult.servico : null;
        const st = calcularStatus(ultData, ultTipo);

        if (st.st === 'vencido') kpi.vencidos++;
        else if (st.st === 'alerta') kpi.alerta++;
        else if (st.st === 'negociacao') kpi.negociacao++;

        // Faturamento TOTAL (Soma tudo)
        hist.forEach(h => {
            if(h.data && h.servico !== 'Orçamento') {
                kpi.receita += parseFloat(h.valor||0);
            }
        });

        if (st.st !== 'ok') {
            listaManutencoesDash.push({ id: c.id, nome: c.nome, telefone: c.telefone, statusObj: st, dataRef: ultData });
        }
        
        if(dl) dl.innerHTML += `<option value="${c.nome}">`;
    });

    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    if(document.getElementById('kpi-negoc')) document.getElementById('kpi-negoc').innerText = kpi.negociacao;
    document.getElementById('kpi-faturamento').innerText = `R$ ${kpi.receita.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    paginaAtualDash = 0;
    renderizarTabelaDashboardPaginada();
}

function renderizarTabelaDashboardPaginada() {
    const tbDash = document.getElementById('tabela-dashboard');
    const btnAnt = document.getElementById('btn-ant-dash');
    const btnProx = document.getElementById('btn-prox-dash');
    const info = document.getElementById('info-pag-dash');

    tbDash.innerHTML = '';

    if (listaManutencoesDash.length === 0) {
        tbDash.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Tudo em dia!</td></tr>';
        if(info) info.innerText = '0 de 0';
        return;
    }

    // Ordena: Vencidos -> Alerta -> Negociacao
    listaManutencoesDash.sort((a, b) => {
        const peso = { 'vencido': 3, 'alerta': 2, 'negociacao': 1 };
        return peso[b.statusObj.st] - peso[a.statusObj.st];
    });

    // Fatia a página atual
    const inicio = paginaAtualDash * itensPorPaginaDash;
    const fim = inicio + itensPorPaginaDash;
    const itensPagina = listaManutencoesDash.slice(inicio, fim);

    itensPagina.forEach(item => {
        let msgTexto = item.statusObj.st === 'negociacao' 
            ? `Olá ${item.nome}, aqui é da HD Aquecedores. Gostaria de saber se conseguiu avaliar nosso orçamento?` 
            : `Olá ${item.nome}, aqui é da HD Aquecedores. Verifiquei que está na hora da manutenção anual. Podemos agendar?`;
        
        const msgEncoded = encodeURIComponent(msgTexto);
        const zap = `https://wa.me/55${limparNumeros(item.telefone)}?text=${msgEncoded}`;
        const icon = item.statusObj.st === 'negociacao' ? '<i class="fas fa-comments-dollar"></i>' : '<i class="fab fa-whatsapp"></i>';
        const btnRenovar = `<button onclick="renovarManutencao(${item.id})" title="Renovar Hoje" style="background:transparent; border:1px solid #10b981; color:#10b981; border-radius:5px; padding:5px 8px; cursor:pointer; margin-left:5px;"><i class="fas fa-check"></i></button>`;

        tbDash.innerHTML += `<tr><td><strong>${item.nome}</strong></td><td><span class="status status-${item.statusObj.st}">${item.statusObj.txt}</span></td><td>${item.dataRef ? formatarData(item.dataRef) : '-'}</td><td><a href="${zap}" target="_blank" class="btn-whatsapp">${icon}</a></td><td>${btnRenovar}</td></tr>`;
    });

    const totalPaginas = Math.ceil(listaManutencoesDash.length / itensPorPaginaDash);
    if(info) info.innerText = `Pág ${paginaAtualDash + 1} de ${totalPaginas}`;
    if(btnAnt) btnAnt.disabled = paginaAtualDash === 0;
    if(btnProx) btnProx.disabled = (paginaAtualDash + 1) >= totalPaginas;
}

window.mudarPaginaDash = (direcao) => {
    paginaAtualDash += direcao;
    if (paginaAtualDash < 0) paginaAtualDash = 0;
    renderizarTabelaDashboardPaginada();
}

// --- ABA CLIENTES: PAGINAÇÃO ---
async function carregarTabelaClientes(termoBusca = "") {
    const tbBase = document.getElementById('tabela-clientes-base');
    const info = document.getElementById('info-paginacao');
    if(tbBase) tbBase.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    
    let query = _supabase.from('clientes').select('*', { count: 'exact' }).order('id', { ascending: false });
    if (termoBusca) query = query.ilike('nome', `%${termoBusca}%`);
    else query = query.range(paginaAtualClientes * itensPorPagina, (paginaAtualClientes * itensPorPagina) + itensPorPagina - 1);

    const { data, count, error } = await query;
    if (error) { if(tbBase) tbBase.innerHTML = '<tr><td colspan="3">Erro acesso.</td></tr>'; return; }

    if(tbBase) {
        tbBase.innerHTML = '';
        if (!data || data.length === 0) tbBase.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nada encontrado.</td></tr>';
        else {
            data.forEach(c => {
                tbBase.innerHTML += `<tr><td><strong>${c.nome}</strong></td><td>${c.endereco || '-'}</td><td><button class="btn-hist" onclick="abrirHistorico(${c.id})">Ver</button></td></tr>`;
            });
        }
    }

    const btnAnt = document.getElementById('btn-ant');
    const btnProx = document.getElementById('btn-prox');
    if(info) {
        if (termoBusca) {
            info.innerText = `Encontrados: ${count}`;
            if(btnAnt) btnAnt.disabled = true; if(btnProx) btnProx.disabled = true;
        } else {
            const totalPaginas = Math.ceil(count / itensPorPagina) || 1;
            info.innerText = `Pág ${paginaAtualClientes + 1} de ${totalPaginas}`;
            if(btnAnt) btnAnt.disabled = paginaAtualClientes === 0;
            if(btnProx) btnProx.disabled = (paginaAtualClientes + 1) >= totalPaginas;
        }
    }
}

window.mudarPagina = (direcao) => { paginaAtualClientes += direcao; if (paginaAtualClientes < 0) paginaAtualClientes = 0; carregarTabelaClientes(); };
window.filtrarClientes = () => { clearTimeout(timeoutBusca); timeoutBusca = setTimeout(() => { paginaAtualClientes = 0; carregarTabelaClientes(document.getElementById('busca-cliente').value); }, 500); };

// --- LEADS ---
async function carregarLeads() {
    const { data, error } = await _supabase.from('agendamentos').select('*').eq('status', 'Pendente').order('created_at', { ascending: false });
    if(error) return;
    leads = data || [];
    const badge = document.getElementById('badge-leads');
    const table = document.getElementById('tabela-leads');
    if (leads.length > 0) { badge.innerText = leads.length; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }
    if(table) {
        table.innerHTML = '';
        if(leads.length === 0) table.innerHTML = `<tr><td colspan="4" style="text-align:center;">Nenhuma solicitação.</td></tr>`;
        else {
            leads.forEach(l => {
                table.innerHTML += `<tr><td>${new Date(l.created_at).toLocaleDateString('pt-BR')}</td><td><strong>${l.nome}</strong><br><small>${l.telefone}</small></td><td>${l.tipo_servico}</td><td><button class="btn-primary" onclick="atenderAgendamento(${l.id})">Atender</button></td></tr>`;
            });
        }
    }
}
async function atenderAgendamento(id) {
    const lead = leads.find(l => l.id === id);
    if(!lead) return;
    document.getElementById('venda-nome').value = lead.nome;
    document.getElementById('venda-tel').value = lead.telefone;
    document.getElementById('venda-data').value = lead.data_preferencia;
    await _supabase.from('agendamentos').update({ status: 'Atendido' }).eq('id', id);
    await carregarLeads(); navegar('vendas');
}

// --- SALVAR/EDITAR/RENOVAR ---
async function salvarCliente(clienteObj) {
    let enderecoFinal = clienteObj.endereco || "";
    if (clienteObj.cidade && !enderecoFinal.includes(clienteObj.cidade)) enderecoFinal = `${enderecoFinal} - ${clienteObj.cidade}`;
    const dados = { nome: clienteObj.nome, telefone: clienteObj.telefone, endereco: enderecoFinal, historico: clienteObj.historico };
    let res;
    if (clienteObj.id) res = await _supabase.from('clientes').update(dados).eq('id', clienteObj.id);
    else res = await _supabase.from('clientes').insert([dados]);
    if (res.error) { alert("Erro ao salvar: " + res.error.message); return false; }
    await carregarDadosDoBanco(); await carregarTabelaClientes(); return true;
}
const formVenda = document.getElementById('form-venda');
if(formVenda) {
    formVenda.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.querySelector('.btn-primary');
        const txtOriginal = btn.innerText;
        btn.innerText = 'Salvando...'; btn.disabled = true;
        try {
            const nome = document.getElementById('venda-nome').value;
            const tel = document.getElementById('venda-tel').value;
            const rua = document.getElementById('venda-endereco').value;
            const cid = document.getElementById('venda-cidade').value;
            const data = document.getElementById('venda-data').value;
            const tipo = document.getElementById('venda-tipo').value;
            const valor = document.getElementById('venda-valor').value;
            const obs = document.getElementById('venda-obs').value;
            let cliente = clientes.find(c => limparNumeros(c.telefone) === limparNumeros(tel));
            const servico = { data, servico: tipo, valor, obs };
            if (cliente) {
                if (!cliente.historico) cliente.historico = [];
                cliente.historico.unshift(servico);
                cliente.nome = nome; cliente.telefone = tel; cliente.endereco = rua; cliente.cidade = cid;
                await salvarCliente(cliente); showToast("Histórico atualizado.");
            } else {
                const novo = { nome, telefone: tel, endereco: rua, cidade: cid, historico: [servico] };
                await salvarCliente(novo); showToast("Novo cliente cadastrado!");
            }
            document.getElementById('form-venda').reset(); navegar('dashboard');
        } catch (err) { console.error(err); } finally { btn.innerText = txtOriginal; btn.disabled = false; }
    });
}
window.renovarManutencao = async (id) => {
    let cliente = clientes.find(c => c.id === id);
    if (!cliente) { const { data } = await _supabase.from('clientes').select('*').eq('id', id).single(); cliente = data; }
    if(!cliente || !confirm(`Renovar manutenção de ${cliente.nome}?`)) return;
    const hoje = new Date().toISOString().split('T')[0];
    if (!cliente.historico) cliente.historico = [];
    cliente.historico.unshift({ data: hoje, servico: 'Manutenção Preventiva', valor: 0, obs: 'Renovação rápida' });
    if(await salvarCliente(cliente)) showToast("Renovado!", "green");
};

// --- GRÁFICOS ---
window.atualizarGrafico = function(meses) {
    periodoGrafico = parseInt(meses);
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.includes(meses >= 12 ? (meses/12) + ' Ano' : meses + 'M')) btn.classList.add('active');
    });
    renderizarGrafico();
}
function renderizarGrafico() {
    const ctx = document.getElementById('financeChart').getContext('2d');
    const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let labels = [], dados = [];
    const hoje = new Date();
    for(let i=periodoGrafico-1; i>=0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
        let label = mesesNomes[d.getMonth()];
        if(periodoGrafico > 12) label += `/${d.getFullYear().toString().substr(2,2)}`;
        labels.push(label);
        let total = 0;
        clientes.forEach(c => {
            (c.historico||[]).forEach(h => {
                if(h.data && h.servico !== 'Orçamento') {
                    const dh = new Date(h.data); dh.setHours(dh.getHours()+12);
                    if(dh.getMonth() === d.getMonth() && dh.getFullYear() === d.getFullYear()) total += parseFloat(h.valor||0);
                }
            });
        });
        dados.push(total);
    }
    if(financeChartInstance) financeChartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    financeChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Faturamento', data: dados, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDark?'#fff':'#333' } }, x: { grid: {display:false}, ticks: { color: isDark?'#fff':'#333', maxTicksLimit:6 } } }, plugins: { legend: { labels: { color: isDark?'#fff':'#333' } } } } });
}

// --- UTILITÁRIOS ---
function setupMenuAndTheme() {
    document.querySelectorAll('.menu-nav a').forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); navegar(link.id.replace('link-', '')); }));
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); document.getElementById('checkbox').checked = true; }
    document.getElementById('checkbox').addEventListener('change', (e) => { const t = e.target.checked ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); renderizarGrafico(); });
}
function navegar(id) {
    document.querySelectorAll('.menu-item').forEach(l => l.classList.remove('active'));
    document.getElementById('link-' + id).classList.add('active');
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-' + id).classList.remove('hidden');
    const titulos = {'dashboard': 'Visão Geral', 'vendas': 'Novo Serviço', 'clientes': 'Base de Clientes', 'financeiro': 'Recibos', 'leads': 'Solicitações do Site'};
    document.getElementById('page-title').innerText = titulos[id] || 'HD System';
    if (window.innerWidth <= 768) toggleSidebar();
    if (id === 'dashboard') renderizarGrafico();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); document.querySelector('.sidebar-overlay').classList.toggle('active'); }
window.toggleSidebar = toggleSidebar;
function calcularStatus(d, tipo) {
    if (!d) return { st: 'novo', txt: 'Novo' };
    if (tipo === 'Orçamento') return { st: 'negociacao', txt: 'Em Aberto' };
    const p = new Date(d); p.setFullYear(p.getFullYear() + 1);
    const diff = Math.ceil((p - new Date()) / 86400000);
    if (diff <= 0) return { st: 'vencido', txt: `Vencido` };
    if (diff <= 30) return { st: 'alerta', txt: `Vence ${diff}d` };
    return { st: 'ok', txt: 'Em dia' };
}
function formatarData(d) { if(!d) return '-'; const dt = new Date(d); dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset()); return dt.toLocaleDateString('pt-BR'); }
function formatarTel(t) { return t ? t.replace(/\D/g, '') : ''; }
function limparNumeros(t) { return formatarTel(t); }
function showToast(msg, color="green") { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = color==="red"?"#e74c3c":"#10b981"; t.className="toast show"; setTimeout(() => t.className="toast", 3000); }
window.abrirHistorico = async (id) => {
    let c = clientes.find(x => x.id === id); 
    if(!c) { const { data } = await _supabase.from('clientes').select('*').eq('id', id).single(); c = data; }
    if(!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome;
    document.getElementById('modal-endereco').innerText = c.endereco || "";
    document.getElementById('modal-telefone').innerText = c.telefone;
    let total = 0; const tl = document.getElementById('modal-timeline'); tl.innerHTML = '';
    (c.historico || []).forEach(h => {
        if(h.servico !== 'Orçamento') total += parseFloat(h.valor || 0);
        tl.innerHTML += `<div class="timeline-item"><span class="t-date">${formatarData(h.data)}</span><span class="t-title">${h.servico}</span><p style="font-size:0.8rem;color:gray">${h.obs||''}</p><span class="t-val">R$ ${parseFloat(h.valor).toFixed(2)}</span></div>`;
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
window.exportarCSV = () => alert("Em breve");
async function atualizarTotalClientes() {
    const { count } = await _supabase.from('clientes').select('*', { count: 'exact', head: true }); 
    const el = document.getElementById('kpi-total-clientes');
    if(el) { el.innerText = count; el.style.color = '#10b981'; setTimeout(() => el.style.color = '', 1000); }
}
window.carregarLeads = carregarLeads;
window.atenderAgendamento = atenderAgendamento;
window.autoPreencherDados = function() {
    const nomeInput = document.getElementById('venda-nome').value;
    const cli = clientes.find(c => c.nome.toLowerCase() === nomeInput.toLowerCase());
    if (cli) {
        document.getElementById('venda-tel').value = cli.telefone || '';
        document.getElementById('venda-endereco').value = cli.endereco || '';
        showToast("Dados encontrados!", "blue");
    }
}