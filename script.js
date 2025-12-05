// --- 1. CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://lhfhrrxhiirnayclvxyc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoZmhycnhoaWlybmF5Y2x2eHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTc0NzUsImV4cCI6MjA4MDUzMzQ3NX0.gdk9mgFuojkQkzmIr4O9KzE_r8y0TMcYnyXMn9DG2n4';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let clientes = [];
let financeChartInstance = null;
let periodoGrafico = 6; 

// --- 2. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    setupMenuAndTheme();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('data-hoje').innerText = new Date().toLocaleDateString('pt-BR', options);

    try {
        await carregarDadosDoBanco();
    } catch (e) {
        console.error("Erro inicial:", e);
        showToast("Erro de conexão", "red");
    }
});

// --- 3. BANCO DE DADOS ---
async function carregarDadosDoBanco() {
    const { data, error } = await _supabase
        .from('clientes')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error("Erro Supabase:", error);
        showToast("Erro ao ler dados", "red");
        return;
    }

    clientes = data || [];
    
    if (clientes.length === 0) {
        setTimeout(async () => {
            if(confirm("Banco vazio. Deseja carregar dados de teste?")) await carregarDadosFicticios();
        }, 500);
    } else {
        renderizarTudo();
        renderizarGrafico();
    }
}

async function salvarCliente(clienteObj) {
    let error = null;

    // CONCATENA ENDEREÇO E CIDADE
    let enderecoFinal = clienteObj.endereco || "";
    if (clienteObj.cidade && !enderecoFinal.toLowerCase().includes(clienteObj.cidade.toLowerCase())) {
        enderecoFinal = `${enderecoFinal} - ${clienteObj.cidade}`;
    }

    const dadosParaSalvar = {
        nome: clienteObj.nome,
        telefone: clienteObj.telefone,
        endereco: enderecoFinal,
        historico: clienteObj.historico
    };

    if (clienteObj.id) {
        const res = await _supabase.from('clientes').update(dadosParaSalvar).eq('id', clienteObj.id);
        error = res.error;
    } else {
        const res = await _supabase.from('clientes').insert([dadosParaSalvar]);
        error = res.error;
    }

    if (error) {
        alert("Erro ao salvar: " + error.message);
        return false;
    }
    
    await carregarDadosDoBanco();
    return true;
}

// --- 4. FORMULÁRIO ---
window.autoPreencherDados = function() {
    const nomeDigitado = document.getElementById('venda-nome').value;
    const cli = clientes.find(c => c.nome.toLowerCase() === nomeDigitado.toLowerCase());
    
    if (cli) {
        document.getElementById('venda-tel').value = cli.telefone || '';
        
        const endCompleto = cli.endereco || '';
        // Tenta separar Rua de Cidade pelo traço " - "
        if (endCompleto.includes(" - ")) {
            const partes = endCompleto.split(" - ");
            const cidade = partes.pop(); // A última parte é a cidade
            const rua = partes.join(" - "); // O resto é a rua
            document.getElementById('venda-cidade').value = cidade;
            document.getElementById('venda-endereco').value = rua;
        } else {
            document.getElementById('venda-endereco').value = endCompleto;
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
    btn.innerHTML = 'Salvando...';
    btn.disabled = true;

    try {
        let cliente = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
        const servico = { data, servico: tipo, valor, obs };

        if (cliente) {
            if (!cliente.historico) cliente.historico = [];
            cliente.historico.unshift(servico);
            cliente.telefone = tel;
            cliente.endereco = rua; 
            cliente.cidade = cid;
            await salvarCliente(cliente);
            showToast("Histórico atualizado!");
        } else {
            const novoCliente = { 
                nome, telefone: tel, endereco: rua, cidade: cid, historico: [servico] 
            };
            await salvarCliente(novoCliente);
            showToast("Novo cliente salvo!");
        }
        document.getElementById('form-venda').reset();
        navegar('dashboard');
    } catch (err) { 
        console.error(err); 
        alert("Erro: " + err.message); 
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
});

// --- 5. RENDERIZAÇÃO ---
function renderizarTudo() {
    const tbDash = document.getElementById('tabela-dashboard');
    const tbBase = document.getElementById('tabela-clientes-base');
    const dl = document.getElementById('lista-clientes-sugestao');
    
    tbDash.innerHTML = '';
    tbBase.innerHTML = '';
    dl.innerHTML = '';

    let kpi = { vencidos: 0, alerta: 0, receita: 0 };
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    clientes.forEach(c => {
        const hist = Array.isArray(c.historico) ? c.historico : [];
        hist.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
        
        const ultData = hist.length > 0 ? hist[0].data : null;
        const status = calcularStatus(ultData);

        if (status.st === 'vencido') kpi.vencidos++;
        else if (status.st === 'alerta') kpi.alerta++;

        hist.forEach(h => {
            if(h.data) {
                const dh = new Date(h.data);
                dh.setHours(dh.getHours() + 12);
                if (dh.getMonth() === mesAtual && dh.getFullYear() === anoAtual) kpi.receita += parseFloat(h.valor || 0);
            }
        });

        // Dashboard
        if (status.st !== 'ok') {
            const zap = `https://wa.me/55${c.telefone}?text=${encodeURIComponent(`Olá ${c.nome}, manutenção venceu.`)}`;
            // CORREÇÃO DO ERRO: Usando formatarData aqui
            tbDash.innerHTML += `
                <tr>
                    <td><strong>${c.nome}</strong></td>
                    <td><span class="status status-${status.st}">${status.txt}</span></td>
                    <td>${ultData ? formatarData(ultData) : '-'}</td>
                    <td><a href="${zap}" target="_blank" class="btn-whatsapp"><i class="fab fa-whatsapp"></i></a></td>
                </tr>`;
        }

        // Clientes
        const zapLink = `https://wa.me/55${c.telefone}`;
        tbBase.innerHTML += `
            <tr>
                <td>${c.nome}</td>
                <td style="font-size:0.8rem; max-width:200px;">${c.endereco || '-'}</td>
                <td><button class="btn-hist" onclick="abrirHistorico(${c.id})">Ver</button></td>
            </tr>`;

        dl.innerHTML += `<option value="${c.nome}">`;
    });

    document.getElementById('kpi-vencidos').innerText = kpi.vencidos;
    document.getElementById('kpi-alerta').innerText = kpi.alerta;
    document.getElementById('kpi-faturamento').innerText = `R$ ${kpi.receita.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// --- GRÁFICO ---
window.atualizarGrafico = function(meses) {
    periodoGrafico = parseInt(meses);
    renderizarGrafico();
}

function renderizarGrafico() {
    const ctx = document.getElementById('financeChart').getContext('2d');
    const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let labels = [], dados = [];
    const hoje = new Date();

    for(let i = periodoGrafico - 1; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        let label = mesesNomes[d.getMonth()];
        if(periodoGrafico > 12) label += `/${d.getFullYear().toString().substr(2,2)}`;
        labels.push(label);
        
        let total = 0;
        clientes.forEach(c => {
            (c.historico || []).forEach(h => {
                if(h.data) {
                    const dh = new Date(h.data);
                    dh.setHours(dh.getHours() + 12);
                    if(dh.getMonth() === d.getMonth() && dh.getFullYear() === d.getFullYear()) total += parseFloat(h.valor || 0);
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
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { labels: { color } } },
            scales: { y: { beginAtZero: true, ticks: { color } }, x: { ticks: { color }, grid: { display: false } } } 
        }
    });
}

// --- UTILS ---
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
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('active'); document.querySelector('.sidebar-overlay').classList.toggle('active'); }
window.toggleSidebar = toggleSidebar;

function calcularStatus(d) {
    if (!d) return { st: 'novo', txt: 'Novo' };
    const p = new Date(d); p.setFullYear(p.getFullYear() + 1);
    const diff = Math.ceil((p - new Date()) / 86400000);
    if (diff <= 0) return { st: 'vencido', txt: `Vencido` };
    if (diff <= 30) return { st: 'alerta', txt: `Vence ${diff}d` };
    return { st: 'ok', txt: 'Em dia' };
}

// CORREÇÃO: Nome padronizado para formatarData
function formatarData(d) { 
    if(!d) return '-';
    const dt = new Date(d); dt.setMinutes(dt.getMinutes() + dt.getTimezoneOffset()); return dt.toLocaleDateString('pt-BR'); 
}
function formatarTel(t) { if(!t) return ''; return t.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); }
function showToast(msg, color="green") { const t = document.getElementById('toast'); t.innerText = msg; t.style.backgroundColor = color==="red"?"#e74c3c":"#10b981"; t.className="toast show"; setTimeout(() => t.className="toast", 3000); }

window.abrirHistorico = (id) => {
    const c = clientes.find(x => x.id === id); if(!c) return;
    document.getElementById('modal-nome-cliente').innerText = c.nome;
    document.getElementById('modal-endereco').innerText = c.endereco || "";
    document.getElementById('modal-telefone').innerText = formatarTel(c.telefone);
    let total = 0; const tl = document.getElementById('modal-timeline'); tl.innerHTML = '';
    (c.historico || []).forEach(h => {
        total += parseFloat(h.valor || 0);
        // CORREÇÃO: Usando formatarData
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

async function carregarDadosFicticios() {
    function gd(d) { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0]; }
    const mocks = [
        { nome: "Construtora Exemplo", telefone: "11999998888", endereco: "Rua Teste, 123 - SP", historico: [{ data: gd(0), servico: "Instalação", valor: 4500, obs: "Teste" }] }
    ];
    await _supabase.from('clientes').insert(mocks);
    window.location.reload();
}