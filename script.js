// --- CONFIGURAÇÃO ---
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIÁVEIS GLOBAIS ---
let clientes = []; 
let leads = []; 
let financeChartInstance = null;
let periodoGrafico = 6; 

// Paginação Clientes
let paginaAtualClientes = 0;
const itensPorPagina = 10;
let timeoutBusca = null;

// Paginação Dashboard
let listaManutencoesDash = [];
let paginaAtualDash = 0;
const itensPorPaginaDash = 20;

let zapAtual = { nome: '', tel: '' };

// --- FUNÇÕES AUXILIARES ---
function formatarDataBonita(dataAmericana) {
    if (!dataAmericana) return '-';
    const partes = dataAmericana.split('T')[0].split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return dataAmericana;
}

function limparNumeros(tel) {
    if (!tel) return '';
    return tel.toString().replace(/\D/g, '');
}

// Remove aspas para não quebrar o HTML
function escaparTexto(texto) {
    if (!texto) return '';
    return texto.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) { mostrarLogin(); } else { iniciarSistema(); }
});

function mostrarLogin() {
    const modal = document.getElementById('modal-login');
    if(modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
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
        if (error) { alert("Erro: " + error.message); btn.innerText = txtOriginal; btn.disabled = false; } 
        else { iniciarSistema(); }
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
    } catch (e) { console.error("Erro start:", e); }
}

window.fazerLogout = async () => {
    if(confirm("Deseja realmente sair?")) { await _supabase.auth.signOut(); window.location.reload(); }
}

// --- DADOS DO DASHBOARD ---
async function carregarDadosDoBanco() {
    const { data, error } = await _supabase.from('clientes').select('*').order('id', { ascending: false });
    if (error) { console.error(error); return; }
    clientes = data || [];
    calcularKPIsEstaticos(); renderizarGrafico(); atualizarTotalClientes(); 
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
        const ultData = ult ? ult.data : c.data_atendimento;
        const ultTipo = ult ? ult.servico : 'Manutenção Preventiva';

        const st = calcularStatus(ultData, ultTipo);
        if (st.st === 'vencido') kpi.vencidos++;
        else if (st.st === 'alerta') kpi.alerta++;
        else if (st.st === 'negociacao') kpi.negociacao++;

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
    let faturamentoTotalPeriodo = 0; 
    const hoje = new Date();
    
    for(let i = periodoGrafico - 1; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        let label = mesesNomes[d.getMonth()];
        if(periodoGrafico > 12) label += `/${d.getFullYear().toString().substr(2,2)}`;
        labels.push(label);
        let totalMes = 0;
        const targetMes = d.getMonth(); const targetAno = d.getFullYear();

        clientes.forEach(c => {
            (c.historico||[]).forEach(h => {
                if(h.data && h.servico !== 'Orçamento') {
                    const dh = new Date(h.data); dh.setHours(dh.getHours()+12); 
                    if(dh.getMonth() === targetMes && dh.getFullYear() === targetAno) totalMes += parseFloat(h.valor||0);
                }
            });
        });
        dados.push(totalMes); faturamentoTotalPeriodo += totalMes;
    }
    const elFat = document.getElementById('kpi-faturamento');
    if(elFat) elFat.innerText = `R$ ${faturamentoTotalPeriodo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if(financeChartInstance) financeChartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    financeChartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Faturamento', data: dados, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDark?'#fff':'#333' } }, x: { grid: {display:false}, ticks: { color: isDark?'#fff':'#333', maxTicksLimit:6 } } }, plugins: { legend: { labels: { color: isDark?'#fff':'#333' } } } } });
}

// --- WHATSAPP INDIVIDUAL ---
window.abrirModalZap = (nome, telefone) => {
    const telLimpo = limparNumeros(telefone);
    if(!telLimpo || telLimpo.length < 10) { alert("Número inválido."); return; }
    zapAtual = { nome, tel: telLimpo };
    document.getElementById('zap-cliente-nome').innerText = `Cliente: ${nome}`;
    document.getElementById('modal-whatsapp').classList.remove('hidden');
}

window.enviarZap = (tipo) => {
    let msg = ""; const nome = zapAtual.nome;
    if (tipo === 'cobranca') msg = `Olá ${nome}, tudo bem? Aqui é da HD Aquecedores. \n\nSegue chave Pix para pagamento.`;
    else if (tipo === 'agendar') msg = `Olá ${nome}, aqui é da HD Aquecedores. \n\nHora da manutenção preventiva! Podemos agendar?`;
    else if (tipo === 'posvenda') msg = `Olá ${nome}, tudo bem? \n\nO aquecedor está funcionando perfeitamente?`;
    else if (tipo === 'orcamento') msg = `Olá ${nome}, aqui é da HD Aquecedores. \n\nAvaliou nosso orçamento?`;
    
    // Tratamento de DDD 55 duplicado
    let telFinal = zapAtual.tel;
    if (!telFinal.startsWith('55')) telFinal = '55' + telFinal;

    const link = `https://wa.me/${telFinal}?text=${encodeURIComponent(msg)}`;
    window.open(link, '_blank');
    document.getElementById('modal-whatsapp').classList.add('hidden');
}

// --- TABELA DASHBOARD ---
function renderizarTabelaDashboardPaginada() {
    const tbDash = document.getElementById('tabela-dashboard');
    const info = document.getElementById('info-pag-dash');
    const btnAnt = document.getElementById('btn-ant-dash');
    const btnProx = document.getElementById('btn-prox-dash');
    tbDash.innerHTML = '';

    if (listaManutencoesDash.length === 0) {
        tbDash.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px;">Tudo em dia!</td></tr>';
        if(info) info.innerText = '0 de 0'; return;
    }

    listaManutencoesDash.sort((a, b) => {
        const peso = { 'negociacao': 10, 'alerta': 10, 'vencido': 5 };
        return (peso[b.statusObj.st] || 0) - (peso[a.statusObj.st] || 0);
    });

    const inicio = paginaAtualDash * itensPorPaginaDash;
    const fim = inicio + itensPorPaginaDash;
    const itensPagina = listaManutencoesDash.slice(inicio, fim);

    itensPagina.forEach(item => {
        const icon = item.statusObj.st === 'negociacao' ? '<i class="fas fa-comments-dollar"></i>' : '<i class="fab fa-whatsapp"></i>';
        const btnRenovar = `<button onclick="renovarManutencao(${item.id})" style="background:transparent; border:1px solid #10b981; color:#10b981; border-radius:5px; padding:5px 8px; cursor:pointer; margin-left:5px;"><i class="fas fa-check"></i></button>`;
        const btnZap = `<button onclick="abrirModalZap('${escaparTexto(item.nome)}', '${item.telefone}')" class="btn-whatsapp" style="border:none; cursor:pointer;">${icon}</button>`;
        tbDash.innerHTML += `<tr><td><strong>${item.nome}</strong></td><td><span class="status status-${item.statusObj.st}">${item.statusObj.txt}</span></td><td>${item.dataRef ? formatarDataBonita(item.dataRef) : '-'}</td><td>${btnZap}</td><td>${btnRenovar}</td></tr>`;
    });

    const totalPaginas = Math.ceil(listaManutencoesDash.length / itensPorPaginaDash);
    if(info) info.innerText = `Pág ${paginaAtualDash + 1} de ${totalPaginas}`;
    if(btnAnt) btnAnt.disabled = paginaAtualDash === 0;
    if(btnProx) btnProx.disabled = (paginaAtualDash + 1) >= totalPaginas;
}
window.mudarPaginaDash = (direcao) => { paginaAtualDash += direcao; if (paginaAtualDash < 0) paginaAtualDash = 0; renderizarTabelaDashboardPaginada(); }

// --- BACKUP ---
window.exportarCSV = async () => {
    if(!confirm("Baixar backup?")) return;
    const { data } = await _supabase.from('clientes').select('*');
    if(!data) return;
    let csv = "ID,Nome,Telefone,Endereco,DataAtendimento\n";
    data.forEach(r => csv += `${r.id},"${r.nome}","${r.telefone}","${r.endereco}","${r.data_atendimento||''}"\n`);
    const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = "backup.csv"; document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// =========================================================================
// === TABELA CLIENTES (BUSCA E FLEX CORRIGIDOS) ===
// =========================================================================
async function carregarTabelaClientes(termoBusca = "") {
    const tbBase = document.getElementById('tabela-clientes-base');
    const info = document.getElementById('info-paginacao');
    
    // Reseta controles
    const headerCheck = document.getElementById('check-all');
    if(headerCheck) headerCheck.checked = false;
    if(typeof atualizarContadorFlex === 'function') atualizarContadorFlex();

    if(tbBase) tbBase.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    
    let query = _supabase.from('clientes').select('*', { count: 'exact' }).order('id', { ascending: false });
    
    // --- LÓGICA DE BUSCA OTIMIZADA ---
    if (termoBusca && termoBusca.trim() !== "") {
        const termo = termoBusca.trim();
        // Busca ignorando maiúsculas/minúsculas
        query = query.or(`nome.ilike.%${termo}%,endereco.ilike.%${termo}%`);
    } else {
        query = query.range(paginaAtualClientes * itensPorPagina, (paginaAtualClientes * itensPorPagina) + itensPorPagina - 1);
    }

    const { data, count, error } = await query;
    if (error) { 
        console.error("Erro busca:", error);
        if(tbBase) tbBase.innerHTML = '<tr><td colspan="5">Erro ao buscar dados.</td></tr>'; 
        return; 
    }

    if(tbBase) {
        tbBase.innerHTML = '';
        if (!data || data.length === 0) tbBase.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nada encontrado.</td></tr>';
        else {
            data.forEach(c => {
                const dataShow = formatarDataBonita(c.data_atendimento);
                // Escapar aspas para não quebrar o HTML
                const nomeSeguro = escaparTexto(c.nome);
                const telefoneSeguro = c.telefone || ""; 
                
                tbBase.innerHTML += `
                    <tr>
                        <td style="text-align: center; vertical-align: middle;">
                             <input type="checkbox" class="check-cliente" 
                                   value="${c.id}"
                                   data-nome="${nomeSeguro}" 
                                   data-tel="${telefoneSeguro}" 
                                   onchange="atualizarContadorFlex()">
                        </td>
                        <td><strong>${c.nome}</strong></td>
                        <td>${c.endereco || '-'}</td>
                        <td>${dataShow}</td>
                        <td>
                            <button class="btn-hist" onclick="abrirHistorico(${c.id})">Ver</button>
                            <button class="btn-delete-row" onclick="abrirModalExclusao(${c.id})" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`;
            });
        }
    }

    const btnAnt = document.getElementById('btn-ant');
    const btnProx = document.getElementById('btn-prox');
    if(info) {
        if (termoBusca) {
            info.innerText = `Encontrados: ${count}`;
            if(btnAnt) btnAnt.disabled = true; 
            if(btnProx) btnProx.disabled = true;
        } else {
            const totalPaginas = Math.ceil(count / itensPorPagina) || 1;
            info.innerText = `Pág ${paginaAtualClientes + 1} de ${totalPaginas}`;
            if(btnAnt) btnAnt.disabled = paginaAtualClientes === 0;
            if(btnProx) btnProx.disabled = (paginaAtualClientes + 1) >= totalPaginas;
        }
    }
}

window.mudarPagina = (direcao) => { paginaAtualClientes += direcao; if (paginaAtualClientes < 0) paginaAtualClientes = 0; carregarTabelaClientes(); };
window.filtrarClientes = () => { 
    clearTimeout(timeoutBusca); 
    timeoutBusca = setTimeout(() => { 
        paginaAtualClientes = 0; 
        carregarTabelaClientes(document.getElementById('busca-cliente').value); 
    }, 500); 
};

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
        leads.forEach(l => {
            table.innerHTML += `<tr><td>${new Date(l.created_at).toLocaleDateString('pt-BR')}</td><td><strong>${l.nome}</strong><br><small>${l.telefone}</small></td><td>${l.tipo_servico}</td><td><button class="btn-primary" onclick="atenderAgendamento(${l.id})">Atender</button></td></tr>`;
        });
    }
}
async function atenderAgendamento(id) {
    const lead = leads.find(l => l.id === id); if(!lead) return;
    document.getElementById('venda-nome').value = lead.nome; document.getElementById('venda-tel').value = lead.telefone; document.getElementById('venda-data').value = lead.data_preferencia;
    await _supabase.from('agendamentos').update({ status: 'Atendido' }).eq('id', id); await carregarLeads(); navegar('vendas');
}

// --- SALVAR E RENOVAR ---
async function salvarCliente(clienteObj) {
    let enderecoFinal = clienteObj.endereco || "";
    if (clienteObj.cidade && !enderecoFinal.includes(clienteObj.cidade)) enderecoFinal = `${enderecoFinal} - ${clienteObj.cidade}`;
    let ultimaData = null;
    if(clienteObj.historico && clienteObj.historico.length > 0) ultimaData = clienteObj.historico[0].data;

    const dados = { nome: clienteObj.nome, telefone: clienteObj.telefone, endereco: enderecoFinal, historico: clienteObj.historico, data_atendimento: ultimaData };
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
        const btn = document.querySelector('.btn-primary'); const txtOriginal = btn.innerText; btn.innerText = 'Salvando...'; btn.disabled = true;
        try {
            const nome = document.getElementById('venda-nome').value; const tel = document.getElementById('venda-tel').value; const rua = document.getElementById('venda-endereco').value; const cid = document.getElementById('venda-cidade').value; const data = document.getElementById('venda-data').value; const tipo = document.getElementById('venda-tipo').value; const valor = document.getElementById('venda-valor').value; const obs = document.getElementById('venda-obs').value;
            let cliente = clientes.find(c => limparNumeros(c.telefone) === limparNumeros(tel));
            const servico = { data, servico: tipo, valor, obs };
            if (cliente) { if (!cliente.historico) cliente.historico = []; cliente.historico.unshift(servico); cliente.nome = nome; cliente.telefone = tel; cliente.endereco = rua; cliente.cidade = cid; await salvarCliente(cliente); showToast("Histórico atualizado."); } 
            else { const novo = { nome, telefone: tel, endereco: rua, cidade: cid, historico: [servico] }; await salvarCliente(novo); showToast("Novo cliente cadastrado!"); }
            document.getElementById('form-venda').reset(); navegar('dashboard');
        } catch (err) { console.error(err); } finally { btn.innerText = txtOriginal; btn.disabled = false; }
    });
}
window.renovarManutencao = async (id) => {
    let c = clientes.find(c => c.id === id); if (!c) { const { data } = await _supabase.from('clientes').select('*').eq('id', id).single(); c = data; }
    if(!c || !confirm(`Renovar manutenção de ${c.nome}?`)) return;
    const hoje = new Date().toISOString().split('T')[0];
    if (!c.historico) c.historico = [];
    c.historico.unshift({ data: hoje, servico: 'Manutenção Preventiva', valor: 0, obs: 'Renovação rápida' });
    if(await salvarCliente(c)) showToast("Renovado!", "green");
};

// --- MODO FLEX (CORREÇÃO DE URL WHATSAPP) ---
window.verificarFlex = (texto) => {
    const input = document.getElementById('busca-cliente');
    if (texto.toLowerCase() === 'flex') { showToast("🚀 Modo Flex Ativado!", "blue"); input.style.borderColor = "#ef4444"; } 
    else { input.style.borderColor = "var(--border)"; }
    if (typeof filtrarClientes === 'function') filtrarClientes(); 
}

window.atualizarContadorFlex = () => {
    const checkboxes = document.querySelectorAll('#tabela-clientes-base .check-cliente:checked');
    const qtd = checkboxes.length;
    
    // --- Botão Flex (Oferta) ---
    const btnFlex = document.getElementById('btn-flex-disparo');
    if (btnFlex) {
        if (qtd > 0 && !document.getElementById('check-all').checked) {
            btnFlex.classList.remove('hidden-force');
            btnFlex.innerHTML = `<i class="fab fa-whatsapp"></i> Disparar Oferta (${qtd})`;
            if(qtd > 5) { btnFlex.style.backgroundColor = '#333'; btnFlex.innerHTML = `Máximo 5! (${qtd})`; btnFlex.disabled = true; } 
            else { btnFlex.style.backgroundColor = '#ef4444'; btnFlex.disabled = false; }
        } else { btnFlex.classList.add('hidden-force'); }
    }

    // --- Botão Excluir ---
    const btnExcluir = document.getElementById('btn-excluir-massa');
    const lblExcluir = document.getElementById('lbl-qtd-excluir');
    if (btnExcluir) {
        if (qtd > 0) {
            btnExcluir.classList.remove('hidden-force');
            if(lblExcluir) lblExcluir.innerText = qtd;
        } else {
            btnExcluir.classList.add('hidden-force');
        }
    }
}

window.selecionarTodos = (source) => {
    const checkboxes = document.querySelectorAll('#tabela-clientes-base .check-cliente');
    checkboxes.forEach(cb => { cb.checked = source.checked; });
    atualizarContadorFlex();
}

window.prepararEnvioMassa = () => {
    const checkboxes = document.querySelectorAll('#tabela-clientes-base .check-cliente:checked');
    const selecionados = Array.from(checkboxes).filter(cb => cb.id !== 'check-all');

    if (selecionados.length === 0) return;
    if (selecionados.length > 5) { alert("Selecione no máximo 5 clientes."); return; }

    const textoBase = "Olá, *[NOME]*! Tudo bem? O técnico da *HD Aquecedores* estará no seu condomínio amanhã atendendo um vizinho. Como já estaremos aí, consigo isentar 100% da taxa de visita para fazer a manutenção do seu aquecedor. Quer que eu reserve um horário para você?";

    let delay = 0;
    let enviados = 0;
    let ignorados = 0;

    selecionados.forEach((check) => {
        const nomeCompleto = check.dataset.nome || "Cliente";
        const primeiroNome = nomeCompleto.split(' ')[0];
        const telefoneOriginal = check.dataset.tel;
        
        // Limpa tudo que não é número
        let telLimpo = limparNumeros(telefoneOriginal);
        
        // Verifica se tem tamanho mínimo (DDD + Numero = 10 dígitos)
        if(!telLimpo || telLimpo.length < 10) {
            console.warn(`Pulei ${nomeCompleto} - Telefone inválido: ${telefoneOriginal}`);
            ignorados++;
            return;
        }

        // --- CORREÇÃO DO DDD 55 (O PULO DO GATO) ---
        // Se o número já começar com 55 e tiver mais de 11 dígitos, provavelmente já tem DDI
        // Ex: 5513999999999 (13 dígitos) -> Mantém
        // Ex: 13999999999 (11 dígitos) -> Adiciona 55 -> 5513999999999
        if (!telLimpo.startsWith('55') || telLimpo.length <= 11) {
            telLimpo = '55' + telLimpo;
        }

        const msgFinal = textoBase.replace('[NOME]', primeiroNome);
        const link = `https://wa.me/${telLimpo}?text=${encodeURIComponent(msgFinal)}`;

        setTimeout(() => { window.open(link, '_blank'); }, delay);
        delay += 1500;
        enviados++;
    });

    if (enviados === 0) {
        alert("⚠️ Nenhum dos clientes selecionados tem número de telefone válido.");
    } else {
        setTimeout(() => {
            document.getElementById('check-all').checked = false;
            selecionados.forEach(c => c.checked = false);
            atualizarContadorFlex();
            let msg = `${enviados} disparos iniciados!`;
            if(ignorados > 0) msg += ` (${ignorados} sem tel)`;
            showToast(msg, "blue");
        }, delay + 500);
    }
}

// --- UTILITÁRIOS ---
function setupMenuAndTheme() {
    document.querySelectorAll('.menu-nav a').forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); navegar(link.id.replace('link-', '')); }));
    const theme = localStorage.getItem('theme'); if (theme === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); document.getElementById('checkbox').checked = true; }
    document.getElementById('checkbox').addEventListener('change', (e) => { const t = e.target.checked ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); renderizarGrafico(); });
}
function navegar(id) {
    document.querySelectorAll('.menu-item').forEach(l => l.classList.remove('active')); document.getElementById('link-' + id).classList.add('active');
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden')); document.getElementById('view-' + id).classList.remove('hidden');
    const titulos = {'dashboard': 'Visão Geral', 'vendas': 'Novo Serviço', 'clientes': 'Base de Clientes', 'financeiro': 'Recibos', 'leads': 'Solicitações do Site'};
    document.getElementById('page-title').innerText = titulos[id] || 'HD System';
    if (window.innerWidth <= 768) toggleSidebar(); if (id === 'dashboard') renderizarGrafico();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); document.querySelector('.sidebar-overlay').classList.toggle('active'); }
window.toggleSidebar = toggleSidebar;
function calcularStatus(d, tipo) {
    if (!d) return { st: 'novo', txt: 'Novo' }; if (tipo === 'Orçamento') return { st: 'negociacao', txt: 'Em Aberto' };
    const dataVenc = new Date(d); dataVenc.setFullYear(dataVenc.getFullYear() + 1);
    const diff = Math.ceil((dataVenc - new Date()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return { st: 'vencido', txt: `Vencido` }; if (diff <= 30) return { st: 'alerta', txt: `Vence ${diff}d` };
    return { st: 'ok', txt: 'Em dia' };
}
function showToast(msg, color="green") { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = color==="red"?"#e74c3c":color==="blue"?"#3b82f6":"#10b981"; t.className="toast show"; setTimeout(() => t.className="toast", 3000); }
window.abrirHistorico = async (id) => {
    let c = clientes.find(x => x.id === id); if(!c) { const { data } = await _supabase.from('clientes').select('*').eq('id', id).single(); c = data; } if(!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome; document.getElementById('modal-endereco').innerText = c.endereco || ""; document.getElementById('modal-telefone').innerText = c.telefone;
    let total = 0; const tl = document.getElementById('modal-timeline'); tl.innerHTML = '';
    (c.historico || []).forEach(h => { if(h.servico !== 'Orçamento') total += parseFloat(h.valor || 0); tl.innerHTML += `<div class="timeline-item"><span class="t-date">${formatarDataBonita(h.data)}</span><span class="t-title">${h.servico}</span><p style="font-size:0.8rem;color:gray">${h.obs||''}</p><span class="t-val">R$ ${parseFloat(h.valor).toFixed(2)}</span></div>`; });
    if ((!c.historico || c.historico.length === 0) && c.data_atendimento) tl.innerHTML += `<div class="timeline-item"><span class="t-date">${formatarDataBonita(c.data_atendimento)}</span><span class="t-title">Importado</span><span class="t-val">-</span></div>`;
    document.getElementById('modal-total').innerText = `R$ ${total.toFixed(2)}`; document.getElementById('modal-historico').classList.remove('hidden');
};
window.fecharModal = (id) => document.getElementById(id).classList.add('hidden');
window.gerarRecibo = () => { document.getElementById('print-nome').innerText = document.getElementById('rec-nome').value; document.getElementById('print-valor').innerText = document.getElementById('rec-valor').value; document.getElementById('print-desc').innerText = document.getElementById('rec-desc').value; document.getElementById('print-data').innerText = new Date().toLocaleDateString(); document.getElementById('modal-recibo').classList.remove('hidden'); };
async function atualizarTotalClientes() { const { count } = await _supabase.from('clientes').select('*', { count: 'exact', head: true }); const el = document.getElementById('kpi-total-clientes'); if(el) el.innerText = count; }
window.carregarLeads = carregarLeads; window.atenderAgendamento = atenderAgendamento;
window.autoPreencherDados = function() { const n = document.getElementById('venda-nome').value; const c = clientes.find(x => x.nome.toLowerCase() === n.toLowerCase()); if (c) { document.getElementById('venda-tel').value = c.telefone||''; document.getElementById('venda-endereco').value = c.endereco||''; showToast("Dados encontrados!", "blue"); } }

// --- FUNÇÕES DE EXCLUSÃO EM MASSA ---
let idExclusaoTemp = null;

window.abrirModalExclusao = (id = null) => {
    idExclusaoTemp = id;
    const modal = document.getElementById('modal-excluir');
    const p = modal.querySelector('.modal-body p');
    
    if (id) {
        p.innerText = "Tem certeza que deseja excluir este cliente permanentemente?";
    } else {
        const qtd = document.querySelectorAll('#tabela-clientes-base .check-cliente:checked').length;
        p.innerText = `Tem certeza que deseja excluir os ${qtd} clientes selecionados?`;
    }
    modal.classList.remove('hidden');
}

window.confirmarExclusao = async () => {
    let ids = [];
    if (idExclusaoTemp) ids = [idExclusaoTemp];
    else ids = Array.from(document.querySelectorAll('#tabela-clientes-base .check-cliente:checked')).map(cb => cb.value);

    if (ids.length === 0) return;

    const btn = document.querySelector('#modal-excluir .btn-primary');
    if(btn) { btn.innerText = "Excluindo..."; btn.disabled = true; }

    const { error } = await _supabase.from('clientes').delete().in('id', ids);

    if (error) {
        alert("Erro ao excluir: " + error.message);
    } else {
        showToast(`${ids.length} cliente(s) excluído(s).`);
        fecharModal('modal-excluir');
        await carregarDadosDoBanco(); // Atualiza KPIs
        await carregarTabelaClientes(); // Atualiza Tabela
        document.getElementById('check-all').checked = false;
    }
    
    if(btn) { btn.innerText = "Sim, Excluir"; btn.disabled = false; }
    atualizarContadorFlex();
}