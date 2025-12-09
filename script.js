// --- CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let clientes = [];
let leads = []; 
let financeChartInstance = null;
let periodoGrafico = 6;

document.addEventListener('DOMContentLoaded', async () => {
    setupMenuAndTheme();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);
    try { 
        await carregarDadosDoBanco(); 
        await carregarLeads(); 
    } catch (e) { 
        console.error("Erro:", e); 
    }
});

// --- LÓGICA DE LEADS (AGENDAMENTOS DO SITE) ---
async function carregarLeads() {
    const { data, error } = await _supabase
        .from('agendamentos')
        .select('*')
        .eq('status', 'Pendente') 
        .order('created_at', { ascending: false });

    if (error) { console.error("Erro leads:", error); return; }

    leads = data || [];
    const badge = document.getElementById('badge-leads');
    const table = document.getElementById('tabela-leads');
    
    if (leads.length > 0) {
        badge.innerText = leads.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    table.innerHTML = '';
    if(leads.length === 0) {
        table.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">Nenhuma solicitação pendente.</td></tr>`;
    } else {
        leads.forEach(l => {
            const dataPed = new Date(l.created_at).toLocaleDateString('pt-BR');
            table.innerHTML += `
                <tr>
                    <td>${dataPed}</td>
                    <td><strong>${l.nome}</strong><br><small>${l.telefone}</small></td>
                    <td>${l.tipo_servico}<br><small>Data Pref: ${l.data_preferencia}</small></td>
                    <td><button class="btn-primary" style="padding:6px 12px; font-size:0.8rem;" onclick="atenderAgendamento(${l.id})">Atender</button></td>
                </tr>
            `;
        });
    }
}

async function atenderAgendamento(id) {
    const lead = leads.find(l => l.id === id);
    if(!lead) return;

    document.getElementById('venda-nome').value = lead.nome;
    document.getElementById('venda-tel').value = lead.telefone;
    document.getElementById('venda-data').value = lead.data_preferencia;
    
    const select = document.getElementById('venda-tipo');
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].text.includes(lead.tipo_servico)) {
            select.selectedIndex = i;
            break;
        }
    }
    document.getElementById('venda-obs').value = "Agendamento Online #" + id;

    await _supabase.from('agendamentos').update({ status: 'Atendido' }).eq('id', id);
    
    await carregarLeads();
    navegar('vendas');
    showToast("Dados do cliente carregados! Complete o cadastro.");
}

// --- BANCO DE DADOS CLIENTES ---
async function carregarDadosDoBanco() {
    const { data, error } = await _supabase.from('clientes').select('*').order('id', { ascending: false });
    if (error) { console.error(error); return; }
    clientes = data || [];
    renderizarTudo();
    renderizarGrafico();
}

async function salvarCliente(clienteObj) {
    let error = null;
    let enderecoFinal = clienteObj.endereco || "";
    if (clienteObj.cidade && !enderecoFinal.includes(clienteObj.cidade)) {
        enderecoFinal = `${enderecoFinal} - ${clienteObj.cidade}`;
    }
    const dados = { nome: clienteObj.nome, telefone: clienteObj.telefone, endereco: enderecoFinal, historico: clienteObj.historico };
    
    if (clienteObj.id) {
        const res = await _supabase.from('clientes').update(dados).eq('id', clienteObj.id);
        error = res.error;
    } else {
        const res = await _supabase.from('clientes').insert([dados]);
        error = res.error;
    }
    if (error) { alert("Erro ao salvar: " + error.message); return false; }
    await carregarDadosDoBanco();
    return true;
}

// Helper para limpar telefone (deixar só numeros) para comparação
function limparNumeros(str) {
    return str ? str.replace(/\D/g, '') : '';
}

window.autoPreencherDados = function() {
    const nomeInput = document.getElementById('venda-nome').value;
    // Tenta achar pelo nome apenas para facilitar o preenchimento inicial
    const cli = clientes.find(c => c.nome.toLowerCase() === nomeInput.toLowerCase());
    
    if (cli) {
        document.getElementById('venda-tel').value = cli.telefone || '';
        const end = cli.endereco || '';
        if (end.includes(" - ")) {
            const partes = end.split(" - ");
            document.getElementById('venda-cidade').value = partes.pop();
            document.getElementById('venda-endereco').value = partes.join(" - ");
        } else {
            document.getElementById('venda-endereco').value = end;
            document.getElementById('venda-cidade').value = "";
        }
        showToast("Dados encontrados! Verifique o telefone.", "blue");
    }
}

// --- LÓGICA DE SALVAMENTO ALTERADA (USANDO TELEFONE COMO ID) ---
document.getElementById('form-venda').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('venda-nome').value;
    const tel = document.getElementById('venda-tel').value;
    const rua = document.getElementById('venda-endereco').value;
    const cid = document.getElementById('venda-cidade').value;
    const data = document.getElementById('venda-data').value;
    const tipo = document.getElementById('venda-tipo').value;
    const valor = document.getElementById('venda-valor').value;
    const obs = document.getElementById('venda-obs').value;
    const btn = document.querySelector('.btn-primary');
    
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = 'Salvando...'; btn.disabled = true;

    try {
        // CORREÇÃO AQUI: Procura o cliente pelo TELEFONE (apenas números), não pelo nome
        const telLimpoInput = limparNumeros(tel);
        let cliente = clientes.find(c => limparNumeros(c.telefone) === telLimpoInput);

        const servico = { data, servico: tipo, valor, obs };
        
        if (cliente) {
            // Cliente já existe (mesmo telefone): Atualiza
            if (!cliente.historico) cliente.historico = [];
            cliente.historico.unshift(servico);
            
            // Atualiza dados cadastrais caso tenham mudado
            cliente.nome = nome; 
            cliente.telefone = tel; 
            cliente.endereco = rua; 
            cliente.cidade = cid;
            
            await salvarCliente(cliente); 
            showToast("Cliente identificado pelo Whats! Histórico atualizado.");
        } else {
            // Telefone novo: Cria novo cliente (mesmo se o nome for igual a outro)
            const novo = { nome, telefone: tel, endereco: rua, cidade: cid, historico: [servico] };
            await salvarCliente(novo); 
            showToast("Novo cliente cadastrado com sucesso!");
        }
        
        document.getElementById('form-venda').reset();
        navegar('dashboard');
    } catch (err) { console.error(err); alert("Erro: " + err.message); } 
    finally { btn.innerHTML = txtOriginal; btn.disabled = false; }
});

// --- FUNÇÃO DE RENOVAR MANUTENÇÃO (BOTÃO VERDE) ---
window.renovarManutencao = async (id) => {
    const cliente = clientes.find(c => c.id === id);
    if(!cliente) return;

    if(!confirm(`Confirmar manutenção de ${cliente.nome} realizada HOJE? \nIsso renovará o ciclo para 1 ano.`)) return;

    // Cria registro de hoje
    const hoje = new Date().toISOString().split('T')[0];
    const novoServico = {
        data: hoje,
        servico: 'Manutenção Preventiva',
        valor: 0, 
        obs: 'Renovação rápida via Dashboard'
    };

    if (!cliente.historico) cliente.historico = [];
    
    // Adiciona no topo do histórico
    cliente.historico.unshift(novoServico);

    // Salva no banco
    const sucesso = await salvarCliente(cliente);
    if(sucesso) {
        showToast("Manutenção Renovada! Ciclo reiniciado.", "green");
    }
};

// --- RENDERIZAÇÃO DA DASHBOARD E TABELAS ---
function renderizarTudo() {
    const tbDash = document.getElementById('tabela-dashboard');
    const tbBase = document.getElementById('tabela-clientes-base');
    const dl = document.getElementById('lista-clientes-sugestao');
    
    tbDash.innerHTML = ''; 
    tbBase.innerHTML = ''; 
    dl.innerHTML = '';

    let kpi = { vencidos: 0, alerta: 0, receita: 0, negociacao: 0 };
    const mesAtual = new Date().getMonth(); 
    const anoAtual = new Date().getFullYear();

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

        hist.forEach(h => {
            if(h.data && h.servico !== 'Orçamento') {
                const dh = new Date(h.data); dh.setHours(dh.getHours()+12);
                if (dh.getMonth() === mesAtual && dh.getFullYear() === anoAtual) kpi.receita += parseFloat(h.valor||0);
            }
        });

        // Tabela Dashboard
        if (st.st !== 'ok') {
            // Lógica da Mensagem Automática do WhatsApp
            let msgTexto = "";
            if (st.st === 'negociacao') {
                msgTexto = `Olá ${c.nome}, tudo bem? Aqui é da HD Aquecedores. Gostaria de saber se conseguiu avaliar nosso orçamento?`;
            } else {
                msgTexto = `Olá ${c.nome}, tudo bem? Aqui é da HD Aquecedores. \n\nVerifiquei em nosso sistema que está na hora de realizarmos a manutenção preventiva anual do seu aquecedor. \n\nPodemos agendar uma visita?`;
            }
            
            const msgEncoded = encodeURIComponent(msgTexto);
            const zap = `https://wa.me/55${limparNumeros(c.telefone)}?text=${msgEncoded}`;
            
            const icon = st.st === 'negociacao' ? '<i class="fas fa-comments-dollar"></i>' : '<i class="fab fa-whatsapp"></i>';
            const btnRenovar = `<button onclick="renovarManutencao(${c.id})" title="Confirmar Manutenção Hoje" style="background:transparent; border:1px solid #10b981; color:#10b981; border-radius:5px; padding:5px 8px; cursor:pointer; margin-left:5px;"><i class="fas fa-check"></i></button>`;

            tbDash.innerHTML += `<tr><td><strong>${c.nome}</strong></td><td><span class="status status-${st.st}">${st.txt}</span></td><td>${ultData ? formatarData(ultData) : '-'}</td><td><a href="${zap}" target="_blank" class="btn-whatsapp">${icon}</a></td><td>${btnRenovar}</td></tr>`;
        }
        
        // Tabela Clientes
        tbBase.innerHTML += `<tr><td>${c.nome}</td><td style="font-size:0.8rem">${c.endereco||'-'}</td><td><button class="btn-hist" onclick="abrirHistorico(${c.id})">Ver</button></td></tr>`;
        dl.innerHTML += `<option value="${c.nome}">`;
    });

    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    if(document.getElementById('kpi-negoc')) document.getElementById('kpi-negoc').innerText = kpi.negociacao;
    document.getElementById('kpi-faturamento').innerText = `R$ ${kpi.receita.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

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
    let somaTotal = 0;

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
        somaTotal += total;
    }
    
    const elFat = document.getElementById('kpi-faturamento');
    if(elFat) elFat.innerText = `R$ ${somaTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;

    if(financeChartInstance) financeChartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const color = isDark ? '#fff' : '#2c3e50';
    financeChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Faturamento', data: dados, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color }, grid: { color: isDark ? '#333' : '#eee' } }, x: { ticks: { color, maxTicksLimit: 6 }, grid: { display: false } } }, plugins: { legend: { labels: { color } } } }
    });
}

// --- CONFIGURAÇÕES DE UI E TEMA ---
function setupMenuAndTheme() {
    document.querySelectorAll('.menu-nav a').forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); navegar(link.id.replace('link-', '')); });
    });
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); document.getElementById('checkbox').checked = true; }
    document.getElementById('checkbox').addEventListener('change', (e) => {
        const t = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); renderizarGrafico();
    });
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
    if (id === 'leads') carregarLeads(); 
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); document.querySelector('.sidebar-overlay').classList.toggle('active'); }
window.toggleSidebar = toggleSidebar;

// --- UTILITÁRIOS ---
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
function formatarTel(t) { if(!t) return ''; return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }
function showToast(msg, color="green") { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = color==="red"?"#e74c3c":(color==="orange"?"#f39c12":"#10b981"); t.className="toast show"; setTimeout(() => t.className="toast", 3000); }

window.abrirHistorico = (id) => {
    const c = clientes.find(x => x.id === id); if(!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome;
    document.getElementById('modal-endereco').innerText = c.endereco || "";
    document.getElementById('modal-telefone').innerText = formatarTel(c.telefone);
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
window.filtrarClientes = () => {
    const termo = document.getElementById('busca-cliente').value.toLowerCase();
    document.querySelectorAll('#tabela-clientes-base tr').forEach(tr => { tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none'; });
};

// Funções globais extras para acesso no HTML
window.carregarLeads = carregarLeads;
window.atenderAgendamento = atenderAgendamento;