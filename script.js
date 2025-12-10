// --- CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIÁVEIS GLOBAIS ---
let clientes = []; 
let leads = []; 
let financeChartInstance = null;
let periodoGrafico = 6; // Começa com 6 meses

// Paginação
let paginaAtualClientes = 0;
const itensPorPagina = 10;
let timeoutBusca = null;

let listaManutencoesDash = [];
let paginaAtualDash = 0;
const itensPorPaginaDash = 20;

let zapAtual = { nome: '', tel: '' };

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) { mostrarLogin(); } else { iniciarSistema(); }
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

async function iniciarSistema() {
    const modal = document.getElementById('modal-login');
    if(modal) modal.classList.add('hidden');
    document.body.style.overflow = 'auto';

    setupMenuAndTheme();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);
    
    try { 
        await carregarDadosDoBanco(); 
        await carregarLeads();        
        await carregarTabelaClientes(); 
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

// --- DADOS DO DASHBOARD ---
async function carregarDadosDoBanco() {
    const { data, error } = await _supabase.from('clientes').select('*').order('id', { ascending: false });
    if (error) { console.error(error); return; }
    clientes = data || [];
    
    calcularKPIsEstaticos(); 
    renderizarGrafico(); // O faturamento é calculado aqui dentro agora!    
    atualizarTotalClientes(); 
}

function calcularKPIsEstaticos() {
    const dl = document.getElementById('lista-clientes-sugestao');
    if(dl) dl.innerHTML = '';
    
    let kpi = { vencidos: 0, alerta: 0, negociacao: 0 };
    listaManutencoesDash = []; 

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

        // Adiciona à lista do dashboard apenas se NÃO estiver 'ok'
        if (st.st !== 'ok') {
            listaManutencoesDash.push({ id: c.id, nome: c.nome, telefone: c.telefone, statusObj: st, dataRef: ultData });
        }
        
        if(dl) dl.innerHTML += `<option value="${c.nome}">`;
    });

    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    if(document.getElementById('kpi-negoc')) document.getElementById('kpi-negoc').innerText = kpi.negociacao;
    
    paginaAtualDash = 0;
    renderizarTabelaDashboardPaginada();
}

// --- GRÁFICOS E FATURAMENTO ---
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
    let faturamentoTotalPeriodo = 0; 
    
    const hoje = new Date();
    
    for(let i = periodoGrafico - 1; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        let label = mesesNomes[d.getMonth()];
        if(periodoGrafico > 12) label += `/${d.getFullYear().toString().substr(2,2)}`;
        labels.push(label);
        
        let totalMes = 0;
        const targetMes = d.getMonth();
        const targetAno = d.getFullYear();

        clientes.forEach(c => {
            (c.historico||[]).forEach(h => {
                if(h.data && h.servico !== 'Orçamento') {
                    const dh = new Date(h.data); dh.setHours(dh.getHours()+12); 
                    if(dh.getMonth() === targetMes && dh.getFullYear() === targetAno) {
                        totalMes += parseFloat(h.valor||0);
                    }
                }
            });
        });
        
        dados.push(totalMes);
        faturamentoTotalPeriodo += totalMes;
    }
    
    const elFat = document.getElementById('kpi-faturamento');
    if(elFat) elFat.innerText = `R$ ${faturamentoTotalPeriodo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    if(financeChartInstance) financeChartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    financeChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Faturamento', data: dados, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDark?'#fff':'#333' } }, x: { grid: {display:false}, ticks: { color: isDark?'#fff':'#333', maxTicksLimit:6 } } }, plugins: { legend: { labels: { color: isDark?'#fff':'#333' } } } } });
}

// --- FUNÇÃO MENU WHATSAPP ---
window.abrirModalZap = (nome, telefone) => {
    if(!telefone) { alert("Cliente sem telefone cadastrado."); return; }
    zapAtual = { nome, tel: limparNumeros(telefone) };
    document.getElementById('zap-cliente-nome').innerText = `Cliente: ${nome}`;
    document.getElementById('modal-whatsapp').classList.remove('hidden');
}

window.enviarZap = (tipo) => {
    let msg = "";
    const nome = zapAtual.nome;
    if (tipo === 'cobranca') {
        msg = `Olá ${nome}, tudo bem? Aqui é da HD Aquecedores. \n\nEstou enviando os dados para pagamento do serviço realizado. \n\nChave Pix: (Sua Chave Pix)`;
    } else if (tipo === 'agendar') {
        msg = `Olá ${nome}, aqui é da HD Aquecedores. \n\nVerifiquei em nosso sistema que está na hora de realizarmos a manutenção preventiva anual. \n\nPodemos agendar uma visita técnica?`;
    } else if (tipo === 'posvenda') {
        msg = `Olá ${nome}, tudo bem? \n\nGostaria de saber se o aquecedor está funcionando perfeitamente após o nosso serviço?`;
    } else if (tipo === 'orcamento') {
        msg = `Olá ${nome}, aqui é da HD Aquecedores. \n\nGostaria de saber se você conseguiu avaliar o orçamento que enviamos?`;
    }
    const link = `https://wa.me/55${zapAtual.tel}?text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
    document.getElementById('modal-whatsapp').classList.add('hidden');
}

// --- TABELA DASHBOARD (MODIFICADA AQUI) ---
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

    // --- ORDENAÇÃO MODIFICADA ---
    listaManutencoesDash.sort((a, b) => {
        // PRIORIDADE: Alerta/Negociação (10) > Vencido (5) > Outros
        const peso = { 
            'negociacao': 10, 
            'alerta': 10,     // AGORA ESTÁ NO TOPO
            'vencido': 5      // AGORA VEM DEPOIS
        };
        
        const pA = peso[a.statusObj.st] || 0;
        const pB = peso[b.statusObj.st] || 0;

        // Se os pesos forem diferentes, o maior ganha
        if (pB !== pA) {
            return pB - pA;
        }

        // DESEMPATE POR DATA (Se ambos forem 'alerta', mostra quem vence primeiro)
        const dataA = new Date(a.dataRef || 0);
        const dataB = new Date(b.dataRef || 0);
        return dataA - dataB;
    });
    // ----------------------------

    const inicio = paginaAtualDash * itensPorPaginaDash;
    const fim = inicio + itensPorPaginaDash;
    const itensPagina = listaManutencoesDash.slice(inicio, fim);

    itensPagina.forEach(item => {
        const icon = item.statusObj.st === 'negociacao' ? '<i class="fas fa-comments-dollar"></i>' : '<i class="fab fa-whatsapp"></i>';
        const btnRenovar = `<button onclick="renovarManutencao(${item.id})" title="Renovar" style="background:transparent; border:1px solid #10b981; color:#10b981; border-radius:5px; padding:5px 8px; cursor:pointer; margin-left:5px;"><i class="fas fa-check"></i></button>`;
        const btnZap = `<button onclick="abrirModalZap('${item.nome}', '${item.telefone}')" class="btn-whatsapp" style="border:none; cursor:pointer;">${icon}</button>`;

        tbDash.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong></td>
                <td><span class="status status-${item.statusObj.st}">${item.statusObj.txt}</span></td>
                <td>${item.dataRef ? formatarData(item.dataRef) : '-'}</td>
                <td>${btnZap}</td>
                <td>${btnRenovar}</td>
            </tr>
        `;
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

// --- BACKUP EXCEL ---
window.exportarCSV = async () => {
    if(!confirm("Deseja baixar o backup completo dos clientes?")) return;
    const { data, error } = await _supabase.from('clientes').select('*');
    if(error) { alert("Erro ao baixar dados: " + error.message); return; }
    if(!data || data.length === 0) { alert("Nada para exportar."); return; }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Nome,Telefone,Endereco,Historico_JSON\n";

    data.forEach(row => {
        const histString = row.historico ? JSON.stringify(row.historico).replace(/"/g, '""') : ""; 
        const linha = `${row.id},"${row.nome}","${row.telefone}","${row.endereco}","${histString}"`;
        csvContent += linha + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "backup_hdaquecedores_" + new Date().toISOString().slice(0,10) + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- PAGINAÇÃO CLIENTES ---
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

// --- LEADS E UTILITÁRIOS ---
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