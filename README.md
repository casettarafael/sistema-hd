# 🔥 HD System PRO - Módulo de Gestão (HD Aquecedores)

> 📊 **CRM completo para HD Aquecedores. Otimiza serviços, gerencia clientes, controla o financeiro e maximiza vendas via agendamento inteligente Flex.**

---

## 🎯 Visão Geral do Projeto

O **HD System PRO** é um painel de controle administrativo e operacional (Dashboard/CRM/ERP) desenvolvido para a gestão diária de uma empresa de manutenção e instalação de aquecedores.

**Ele centraliza funcionalidades cruciais como:**

* **Dashboard:** KPIs de clientes, faturamento e alertas de manutenções vencidas/a vencer (30 dias).
* **Gestão de Clientes:** Base completa com histórico de serviço (`view-clientes`).
* **Registro de Serviços:** Cadastro de novos orçamentos, instalações e manutenções (`view-vendas`).
* **Financeiro:** Geração de recibos simples e rastreamento de receita.
* **Leads:** Captura de solicitações de serviço do site (`view-leads`).

## 💡 Estratégia "Modo Flex"

O recurso principal de otimização de vendas é o **Modo Flex**.

Esta estratégia permite que o operador:

1.  **Busque Clientes por Região:** Digitando `Flex` na busca da Base de Clientes.
2.  **Agrupe Vizinhos:** Selecione até 5 clientes que estão próximos um do outro.
3.  **Dispare Ofertas:** Envia mensagens de WhatsApp (com o texto pré-definido no código) oferecendo **isenção da taxa de visita** para agendar um serviço no mesmo dia e local onde o técnico já estará, maximizando o lucro por deslocamento.

## 💻 Estrutura Técnica

O projeto é uma aplicação Single Page Application (SPA) com front-end leve em HTML, CSS e JavaScript puro.

* **Linguagens:** HTML5, CSS3, JavaScript (Vanilla JS).
* **Design:** Responsivo (Vários estilos CSS para mobile, desktop e impressão).
* **Ícones:** Font Awesome (`<i class="fas...">`).
* **Gráficos:** Chart.js para visualização do desempenho financeiro.
* **Banco de Dados:** Supabase (Client-side) para autenticação e gestão de dados (`@supabase/supabase-js@2`).

## ⚙️ Como Configurar e Executar

1.  **Pré-requisitos:** Node.js (ou servidor web simples) e uma conta Supabase ativa.
2.  **Clonagem:**
    ```bash
    git clone [https://github.com/casettarafael/HD-System-PRO.git](https://github.com/casettarafael/HD-System-PRO.git)
    cd HD-System-PRO
    ```
3.  **Configuração do Supabase:**
    * Crie um projeto no Supabase.
    * Crie as tabelas necessárias (ex: `clientes`, `servicos`, `leads`).
    * No arquivo `script.js` (ou onde estiver a inicialização), insira suas chaves de API do Supabase e o URL do projeto.

4.  **Execução:**
    Como é um projeto puramente *client-side*, basta abrir o arquivo `index.html` no navegador, ou executá-lo via um servidor local (ex: Live Server do VS Code).

## 🤝 Contribuição

Contribuições são bem-vindas! Se você tiver ideias para aprimorar o Modo Flex ou adicionar novos KPIs, por favor, envie um Pull Request.

---
Desenvolvido por **casettarafael**
