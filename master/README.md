# 👑 Master Control Plane (Super Sistema de Licenciamento & Gestão SaaS)

O **Master** é a central de comando independente do proprietário da plataforma. Ele é responsável por emitir licenças, gerenciar assinaturas, receber pagamentos recorrentes de mensalidade/anuidade, monitorar instalações de clientes em tempo real e controlar remotamente as permissões de cada servidor de atendimento distribuído.

---

## 🎯 1. Principais Funcionalidades

- **Auto-Registro de Instalações:** Novas instalações do software cliente comunicam-se automaticamente com o Master no primeiro boot, sendo registradas instantaneamente com período de avaliação (Trial de 30 dias).
- **Controle Remoto de Status:** Bloqueio e desbloqueio imediato do cliente (*"Pagou usou, não pagou bloqueou"*), sincronizado em até 5 segundos via heartbeat e WebSocket.
- **Controle de Modelo de Operação:** Permite definir remotamente qual modo o cliente pode utilizar:
  - `native`: Modo Nativo (Gestão interna de clientes e cobranças nativas).
  - `erp`: Modo ERP/Provedor (Integração com sistemas como RBX Soft, IXC, MK-Auth).
  - `hybrid`: Modo Híbrido (ERP + Base local).
- **Módulo Financeiro do Dono da Plataforma:**
  - Token e Secret próprios do Mercado Pago para recebimento de assinaturas (mensal ou anual).
  - Liberação e renovação automática de licenças via Webhook do Mercado Pago.
  - Concessão de descontos e extensão manual de prazos de teste.
- **Painel Administrativo Embutido:** Interface visual moderna e responsiva servida diretamente pelo binário Go (sem necessidade de Node.js ou compilação externa).

---

## 🚀 2. Como Instalar o Master (Servidor/VPS Dedicado)

O Master foi projetado para rodar isolado na sua própria máquina ou VPS (ex: DigitalOcean, AWS, Hetzner, Linode).

### Opção A: Instalação Automatizada em Linux Básico (Ubuntu / Debian / CentOS / Rocky)

1. Transfira a pasta `master/` para o servidor ou clone o repositório.
2. Execute o script de instalação como root:
```bash
cd master
sudo bash install-linux.sh
```
3. O instalador cuidará de:
   - Instalar dependências (curl, wget, ufw/firewalld).
   - Instalar o compilador Golang (caso não exista).
   - Compilar o binário estático de alto desempenho em `/opt/sol-master/master`.
   - Criar o usuário de sistema seguro `solmaster`.
   - Configurar o arquivo `/opt/sol-master/.env`.
   - Criar e iniciar o serviço systemd `sol-master.service`.
   - Liberar a porta `8090` no firewall.

**Acesse o painel no navegador:**
```text
http://SEU_IP_OU_DOMINIO:8090/
```

**Comandos de Gestão no Linux:**
```bash
sudo systemctl status sol-master    # Ver status do serviço
sudo journalctl -u sol-master -f   # Acompanhar logs em tempo real
sudo systemctl restart sol-master  # Reiniciar serviço
```

---

### Opção B: Instalação via Docker Compose

Caso prefira rodar via containers Docker:

1. Configure o arquivo `.env` (ou utilize os valores padrão):
```bash
cd master
cp .env.example .env
```
2. Inicie o container em segundo plano:
```bash
docker compose up -d
```
3. O container `sol-master-license` estará ativo na porta `8090` com persistência de dados no volume `master_data`.

**Comandos Docker:**
```bash
docker compose logs -f master   # Ver logs em tempo real
docker compose restart master   # Reiniciar container
docker compose down             # Parar container
```

---

## ⚙️ 3. Variáveis de Ambiente do Master

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `MASTER_PORT` ou `PORT` | `8090` | Porta HTTP do painel e API do Master |
| `DATA_FILE_PATH` | `/opt/sol-master/data/master_licenses.json` | Caminho do arquivo JSON de persistência segura |
| `MASTER_JWT_SECRET` | Aleatório | Chave criptográfica para validação de requisições |
| `MASTER_ADMIN_KEY` | *(Vazio)* | Chave de proteção das rotas administrativas (opcional) |
| `SUPPORT_CONTACT_PHONE` | `(11) 98765-4321` | Telefone exibido aos clientes nas telas de bloqueio |
| `SUPPORT_CONTACT_EMAIL` | `comercial@soltelecom.com.br` | E-mail de suporte comercial para os clientes |

---

## 📡 4. Endpoints Principais da API do Master

### Rotas Públicas dos Clientes:
- `POST /api/v1/licenses/auto-register`: Identifica e registra uma nova máquina/instalação de cliente.
- `POST /api/v1/licenses/heartbeat`: Recebe pulso periódico (a cada 5s) do cliente e devolve status atualizado.
- `POST /api/v1/licenses/activate`: Ativação manual de chave.
- `GET /api/v1/licenses/plans`: Lista planos de assinatura (Mensal e Anual).
- `POST /api/v1/licenses/checkout`: Gera PIX no Mercado Pago do Master para o cliente pagar a licença.
- `POST /api/v1/master/webhook/mercadopago`: Recebe notificação de pagamento do Mercado Pago e libera o cliente.

### Rotas de Gestão Administrativa:
- `GET /api/v1/master/tenants`: Lista todos os clientes instalados e seus status.
- `PUT /api/v1/master/tenants/{id}/status`: Altera status (`active`, `trial`, `suspended`, `expired`).
- `PUT /api/v1/master/tenants/{id}/operation-mode`: Altera modo de operação (`native`, `erp`, `hybrid`).
- `PUT /api/v1/master/tenants/{id}/trial`: Adiciona dias extras de teste.
- `PUT /api/v1/master/tenants/{id}/discount`: Aplica desconto no valor da assinatura.
- `GET /api/v1/master/finance`: Consulta credenciais e planos do Mercado Pago do Master.
- `PUT /api/v1/master/finance`: Atualiza credenciais e planos do Mercado Pago do Master.
