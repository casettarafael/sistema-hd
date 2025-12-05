// CONFIGURAÇÃO SUPABASE
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let clientes = [];
let financeChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    setupMenuAndTheme();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);
    try { await carregarDadosDoBanco(); } catch (e) { console.error("Erro:", e); showToast("Erro conexão", "red"); }
});

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

window.toggleSidebar = function() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('overlay').classList.toggle('active'); // Liga o overlay
}

// RESTO DA LÓGICA (Formulários, Renderização, etc - igual ao anterior)
window.autoPreencherDados = function() {
    const nome = document.getElementById('venda-nome').value;
    const cli = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
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
        showToast("Dados carregados!", "blue");
    }
}

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
        let cliente = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
        const servico = { data, servico: tipo, valor, obs };
        if (cliente) {
            if (!cliente.historico) cliente.historico = [];
            cliente.historico.unshift(servico);
            cliente.telefone = tel; cliente.endereco = rua; cliente.cidade = cid;
            await salvarCliente(cliente); showToast("Histórico atualizado!");
        } else {
            const novo = { nome, telefone: tel, endereco: rua, cidade: cid, historico: [servico] };
            await salvarCliente(novo); showToast("Novo cliente salvo!");
        }
        document.getElementById('form-venda').reset();
        navegar('dashboard');
    } catch (err) { console.error(err); alert("Erro: " + err.message); } 
    finally { btn.innerHTML = txtOriginal; btn.disabled = false; }
});

function renderizarTudo() {
    const tbDash = document.getElementById('tabela-dashboard');
    const tbBase = document.getElementById('tabela-clientes-base');
    const dl = document.getElementById('lista-clientes-sugestao');
    tbDash.innerHTML = ''; tbBase.innerHTML = ''; dl.innerHTML = '';
    let kpi = { vencidos: 0, alerta: 0, receita: 0 };
    const mesAtual = new Date().getMonth(); const anoAtual = new Date().getFullYear();

    clientes.forEach(c => {
        const hist = Array.isArray(c.historico) ? c.historico : [];
        hist.sort((a, b) => new Date(b.data||0) - new Date(a.data||0));
        const ult = hist.length > 0 ? hist[0].data : null;
        const st = calcularStatus(ult);
        if (st.st === 'vencido') kpi.vencidos++; else if (st.st === 'alerta') kpi.alerta++;
        hist.forEach(h => {
            if(h.data) {
                const dh = new Date(h.data); dh.setHours(dh.getHours()+12);
                if (dh.getMonth() === mesAtual && dh.getFullYear() === anoAtual) kpi.receita += parseFloat(h.valor||0);
            }
        });
        if (st.st !== 'ok') {
            const zap = `https://wa.me/55${c.telefone}`;
            tbDash.innerHTML += `<tr><td><strong>${c.nome}</strong></td><td><span class="status status-${st.st}">${st.txt}</span></td><td>${ult ? formatData(ult) : '-'}</td><td><a href="${zap}" target="_blank" class="btn-whatsapp"><i class="fab fa-whatsapp"></i></a></td></tr>`;
        }
        tbBase.innerHTML += `<tr><td>${c.nome}</td><td style="font-size:0.8rem">${c.endereco||'-'}</td><td><button class="btn-hist" onclick="abrirHistorico(${c.id})">Ver</button></td></tr>`;
        dl.innerHTML += `<option value="${c.nome}">`;
    });
    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    document.getElementById('kpi-faturamento').innerText = `R$ ${kpi.receita.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

function renderizarGrafico() {
    const ctx = document.getElementById('financeChart').getContext('2d');
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let labels = [], dados = [];
    const hoje = new Date();
    for(let i=5; i>=0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
        labels.push(meses[d.getMonth()]);
        let total = 0;
        clientes.forEach(c => {
            (c.historico||[]).forEach(h => {
                if(h.data) {
                    const dh = new Date(h.data); dh.setHours(dh.getHours()+12);
                    if(dh.getMonth() === d.getMonth() && dh.getFullYear() === d.getFullYear()) total += parseFloat(h.valor||0);
                }
            });
        });
        dados.push(total);
    }
    if(financeChartInstance) financeChartInstance.destroy();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    financeChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Faturamento', data: dados, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }, plugins: { legend: { labels: { color: isDark ? '#fff' : '#333' } } } }
    });
}

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
    const titulos = {'dashboard': 'Visão Geral', 'vendas': 'Novo Serviço', 'clientes': 'Base de Clientes', 'financeiro': 'Recibos'};
    document.getElementById('page-title').innerText = titulos[id];
    if (window.innerWidth <= 768) toggleSidebar();
    if (id === 'dashboard') renderizarGrafico();
}
function calcularStatus(d) {
    if (!d) return { st: 'novo', txt: 'Novo' };
    const p = new Date(d); p.setFullYear(p.getFullYear() + 1);
    const diff = Math.ceil((p - new Date()) / 86400000);
    if (diff <= 0) return { st: 'vencido', txt: `Vencido` };
    if (diff <= 30) return { st: 'alerta', txt: `Vence ${diff}d` };
    return { st: 'ok', txt: 'Em dia' };
}
function formatData(d) { if(!d) return '-'; const dt = new Date(d); dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset()); return dt.toLocaleDateString('pt-BR'); }
function formatarTel(t) { if(!t) return ''; return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }
function showToast(msg, color="green") { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = color==="red"?"#e74c3c":"#10b981"; t.className="toast show"; setTimeout(() => t.className="toast", 3000); }
window.abrirHistorico = (id) => {
    const c = clientes.find(x => x.id === id); if(!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome;
    document.getElementById('modal-endereco').innerText = c.endereco || "";
    document.getElementById('modal-cidade').innerText = "";
    document.getElementById('modal-telefone').innerText = formatarTel(c.telefone);
    let total = 0; const tl = document.getElementById('modal-timeline'); tl.innerHTML = '';
    (c.historico || []).forEach(h => {
        total += parseFloat(h.valor || 0);
        tl.innerHTML += `<div class="timeline-item"><span class="t-date">${formatData(h.data)}</span><span class="t-title">${h.servico}</span><p style="font-size:0.8rem;color:gray">${h.obs||''}</p><span class="t-val">R$ ${parseFloat(h.valor).toFixed(2)}</span></div>`;
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