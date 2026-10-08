package database

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/lib/pq"

	"chat-interno-server/internal/models"
)

type DB struct {
	*sql.DB
}

func Connect(databaseURL string) (*DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("falha ao abrir conexão com postgres: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("falha ao comunicar com postgres (%s): %w", databaseURL, err)
	}

	log.Println("🐘 Conexão com o PostgreSQL estabelecida com sucesso!")

	database := &DB{DB: db}
	if err := database.runMigrations(); err != nil {
		return nil, fmt.Errorf("falha ao rodar migrations do banco: %w", err)
	}

	return database, nil
}

func (db *DB) runMigrations() error {
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(150) NOT NULL,
		email VARCHAR(150) UNIQUE NOT NULL,
		role VARCHAR(32) NOT NULL,
		department VARCHAR(150) NOT NULL,
		password_hash VARCHAR(256) NOT NULL,
		active BOOLEAN NOT NULL DEFAULT TRUE,
		phone VARCHAR(32) DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		last_login TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

	CREATE TABLE IF NOT EXISTS chat_settings (
		key VARCHAR(64) PRIMARY KEY,
		value JSONB NOT NULL,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS customer_network (
		cpf_cnpj VARCHAR(32) PRIMARY KEY,
		olt VARCHAR(100) DEFAULT '',
		pon VARCHAR(100) DEFAULT '',
		cto VARCHAR(100) DEFAULT '',
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS devices (
		device_id VARCHAR(100) PRIMARY KEY,
		cpf_cnpj VARCHAR(32) DEFAULT '',
		client_name VARCHAR(150) DEFAULT '',
		platform VARCHAR(32) DEFAULT '',
		push_token TEXT DEFAULT '',
		app_version VARCHAR(32) DEFAULT '',
		olt VARCHAR(100) DEFAULT '',
		pon VARCHAR(100) DEFAULT '',
		cto VARCHAR(100) DEFAULT '',
		rbx_group VARCHAR(100) DEFAULT '',
		last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_customer_network_olt ON customer_network(olt);
	CREATE INDEX IF NOT EXISTS idx_customer_network_cto ON customer_network(cto);
	CREATE INDEX IF NOT EXISTS idx_devices_cpf ON devices(cpf_cnpj);
	CREATE INDEX IF NOT EXISTS idx_devices_olt ON devices(olt);
	CREATE INDEX IF NOT EXISTS idx_devices_cto ON devices(cto);

	CREATE TABLE IF NOT EXISTS network_olts (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(150) NOT NULL,
		model VARCHAR(100) DEFAULT '',
		ip VARCHAR(64) DEFAULT '',
		location VARCHAR(150) DEFAULT '',
		description TEXT DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS network_slots (
		id VARCHAR(64) PRIMARY KEY,
		olt_id VARCHAR(64) NOT NULL REFERENCES network_olts(id) ON DELETE CASCADE,
		slot_number INT NOT NULL DEFAULT 1,
		name VARCHAR(150) NOT NULL,
		card_type VARCHAR(100) DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS network_pons (
		id VARCHAR(64) PRIMARY KEY,
		slot_id VARCHAR(64) NOT NULL REFERENCES network_slots(id) ON DELETE CASCADE,
		olt_id VARCHAR(64) NOT NULL,
		pon_number INT NOT NULL DEFAULT 1,
		name VARCHAR(150) NOT NULL,
		sfp_type VARCHAR(50) DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS network_ctos (
		id VARCHAR(64) PRIMARY KEY,
		pon_id VARCHAR(64) NOT NULL REFERENCES network_pons(id) ON DELETE CASCADE,
		slot_id VARCHAR(64) NOT NULL,
		olt_id VARCHAR(64) NOT NULL,
		name VARCHAR(150) NOT NULL,
		splitter_ratio VARCHAR(32) DEFAULT '1:16',
		total_ports INT DEFAULT 16,
		address TEXT DEFAULT '',
		coordinates VARCHAR(100) DEFAULT '',
		notes TEXT DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_network_slots_olt ON network_slots(olt_id);
	CREATE INDEX IF NOT EXISTS idx_network_pons_slot ON network_pons(slot_id);
	CREATE INDEX IF NOT EXISTS idx_network_pons_olt ON network_pons(olt_id);
	CREATE INDEX IF NOT EXISTS idx_network_ctos_pon ON network_ctos(pon_id);
	CREATE INDEX IF NOT EXISTS idx_network_ctos_olt ON network_ctos(olt_id);

	CREATE TABLE IF NOT EXISTS conversations (
		id VARCHAR(64) PRIMARY KEY,
		client_id VARCHAR(64) NOT NULL,
		client_name VARCHAR(150) NOT NULL,
		contact_name VARCHAR(150) DEFAULT '',
		cpf_cnpj VARCHAR(32) DEFAULT '',
		department VARCHAR(100) DEFAULT '',
		status VARCHAR(32) NOT NULL DEFAULT 'waiting',
		operator_id VARCHAR(64) DEFAULT '',
		operator_name VARCHAR(150) DEFAULT '',
		olt VARCHAR(100) DEFAULT '',
		pon VARCHAR(100) DEFAULT '',
		cto VARCHAR(100) DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
	CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
	CREATE INDEX IF NOT EXISTS idx_conversations_cpf ON conversations(cpf_cnpj);
	CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

	CREATE TABLE IF NOT EXISTS messages (
		id VARCHAR(64) PRIMARY KEY,
		conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
		sender_id VARCHAR(64) NOT NULL,
		sender_type VARCHAR(32) NOT NULL,
		sender_name VARCHAR(150) NOT NULL,
		content TEXT NOT NULL,
		timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		status VARCHAR(32) NOT NULL DEFAULT 'delivered'
	);

	CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
	CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp ASC);

	-- Migrações incrementais seguras para conversations (TMA, TME, Avaliações, Grupos RBX)
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS rbx_group VARCHAR(150) DEFAULT '';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS closed_by VARCHAR(32) DEFAULT '';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS close_reason TEXT DEFAULT '';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS rating INT;
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS rating_comment TEXT DEFAULT '';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS rated_at TIMESTAMP WITH TIME ZONE;

	-- Migrações incrementais para canais Omnichannel (Telegram, WhatsApp Oficial, WhatsApp Evolution)
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'mobile';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_id VARCHAR(100) DEFAULT '';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_meta TEXT DEFAULT '';

	-- Migrações incrementais para Chatbot e Fluxo de Identificação
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_step VARCHAR(64) DEFAULT '';
	ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_node_id VARCHAR(64) DEFAULT '';

	CREATE INDEX IF NOT EXISTS idx_conversations_operator ON conversations(operator_id);
	CREATE INDEX IF NOT EXISTS idx_conversations_dept ON conversations(department);
	CREATE INDEX IF NOT EXISTS idx_conversations_rating ON conversations(rating);
	CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel, channel_id);

	CREATE TABLE IF NOT EXISTS channel_configs (
		key VARCHAR(50) PRIMARY KEY,
		data JSONB NOT NULL,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	-- Configurações Globais do Sistema e Modos de Trabalho (ERP vs Nativo vs Híbrido)
	CREATE TABLE IF NOT EXISTS system_settings (
		key VARCHAR(64) PRIMARY KEY,
		operation_mode VARCHAR(32) NOT NULL DEFAULT 'erp',
		setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
		company_name VARCHAR(150) DEFAULT 'SOL Provedor de Internet',
		company_cnpj VARCHAR(32) DEFAULT '',
		company_phone VARCHAR(32) DEFAULT '',
		company_email VARCHAR(150) DEFAULT '',
		mercadopago_access_token TEXT DEFAULT '',
		mercadopago_public_key TEXT DEFAULT '',
		mercadopago_webhook_secret TEXT DEFAULT '',
		mercadopago_sandbox BOOLEAN DEFAULT TRUE,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	-- Planos e Serviços Nativos (Modo Banco Próprio)
	CREATE TABLE IF NOT EXISTS native_plans (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(150) NOT NULL,
		description TEXT DEFAULT '',
		price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		billing_cycle VARCHAR(32) NOT NULL DEFAULT 'mensal',
		speed_download VARCHAR(50) DEFAULT '',
		speed_upload VARCHAR(50) DEFAULT '',
		active BOOLEAN NOT NULL DEFAULT TRUE,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	-- Clientes da Base Nativa do Sistema
	CREATE TABLE IF NOT EXISTS native_customers (
		id VARCHAR(64) PRIMARY KEY,
		name VARCHAR(150) NOT NULL,
		cpf_cnpj VARCHAR(32) UNIQUE NOT NULL,
		email VARCHAR(150) DEFAULT '',
		phone VARCHAR(32) DEFAULT '',
		address TEXT DEFAULT '',
		number VARCHAR(32) DEFAULT '',
		complement VARCHAR(100) DEFAULT '',
		neighborhood VARCHAR(100) DEFAULT '',
		city VARCHAR(100) DEFAULT '',
		state VARCHAR(10) DEFAULT '',
		postal_code VARCHAR(20) DEFAULT '',
		plan_id VARCHAR(64) REFERENCES native_plans(id) ON DELETE SET NULL,
		monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		due_day INT NOT NULL DEFAULT 10,
		status VARCHAR(32) NOT NULL DEFAULT 'active',
		notes TEXT DEFAULT '',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_native_customers_cpf ON native_customers(cpf_cnpj);
	CREATE INDEX IF NOT EXISTS idx_native_customers_status ON native_customers(status);

	-- Faturas e Cobranças com Integração Mercado Pago (Pix e Boleto)
	CREATE TABLE IF NOT EXISTS native_invoices (
		id VARCHAR(64) PRIMARY KEY,
		customer_id VARCHAR(64) NOT NULL REFERENCES native_customers(id) ON DELETE CASCADE,
		cpf_cnpj VARCHAR(32) NOT NULL,
		amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		due_date DATE NOT NULL,
		status VARCHAR(32) NOT NULL DEFAULT 'pending',
		description TEXT DEFAULT '',
		payment_method VARCHAR(32) NOT NULL DEFAULT 'pix',
		mp_payment_id VARCHAR(64) DEFAULT '',
		pix_qr_code TEXT DEFAULT '',
		pix_qr_code_base64 TEXT DEFAULT '',
		boleto_url TEXT DEFAULT '',
		boleto_barcode TEXT DEFAULT '',
		paid_at TIMESTAMP WITH TIME ZONE,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_native_invoices_customer ON native_invoices(customer_id);
	CREATE INDEX IF NOT EXISTS idx_native_invoices_cpf ON native_invoices(cpf_cnpj);
	CREATE INDEX IF NOT EXISTS idx_native_invoices_status ON native_invoices(status);
	CREATE INDEX IF NOT EXISTS idx_native_invoices_mp ON native_invoices(mp_payment_id);

	-- Licenciamento do Sistema (Controle de Ativação, Trial, Descontos e Bloqueio)
	CREATE TABLE IF NOT EXISTS system_license (
		id INT PRIMARY KEY DEFAULT 1,
		license_key VARCHAR(120) NOT NULL DEFAULT '',
		tenant_cnpj VARCHAR(32) DEFAULT '',
		tenant_name VARCHAR(150) DEFAULT '',
		license_type VARCHAR(32) NOT NULL DEFAULT 'trial',
		status VARCHAR(32) NOT NULL DEFAULT 'trial',
		trial_days_remaining INT NOT NULL DEFAULT 30,
		expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
		grace_period_until TIMESTAMP WITH TIME ZONE NOT NULL,
		last_heartbeat_at TIMESTAMP WITH TIME ZONE,
		max_operators INT NOT NULL DEFAULT 10,
		allowed_modules VARCHAR(150) NOT NULL DEFAULT 'erp,native,omnichannel',
		suspension_reason TEXT DEFAULT '',
		payment_pix TEXT DEFAULT '',
		payment_qr_code_base64 TEXT DEFAULT '',
		payment_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		discount_description TEXT DEFAULT '',
		discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
		contact_support_phone VARCHAR(50) DEFAULT '',
		contact_support_email VARCHAR(150) DEFAULT '',
		signature TEXT DEFAULT '',
		allowed_operation_mode VARCHAR(32) NOT NULL DEFAULT 'hybrid',
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	);
	`

	if _, err := db.Exec(query); err != nil {
		return err
	}

	_, _ = db.Exec("ALTER TABLE system_license ADD COLUMN IF NOT EXISTS allowed_operation_mode VARCHAR(32) NOT NULL DEFAULT 'hybrid';")

	// Semeia configurações padrões (mensagem de encerramento e fluxo visual)
	if err := db.seedDefaultSettings(); err != nil {
		return err
	}

	// Semeia licença inicial em modo demonstração / trial de 30 dias se não existir
	if err := db.seedDefaultLicense(); err != nil {
		log.Println("⚠️ Aviso ao semear licença inicial:", err)
	}

	// Semeia rede FTTH padrão se estiver vazia
	if err := db.seedDefaultNetwork(); err != nil {
		log.Println("⚠️ Aviso ao semear rede padrão:", err)
	}

	// Semeia o Administrador Geral padrão se não houver usuários cadastrados
	return db.seedAdminUser()
}

func (db *DB) seedAdminUser() error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return err
	}

	if count == 0 {
		log.Println("🌱 Semeando usuário Administrador Master no PostgreSQL...")
		hash := hashPassword("SolAdmin#2026")
		now := time.Now().UTC()

		insertQuery := `
		INSERT INTO users (id, name, email, role, department, password_hash, active, phone, created_at, last_login)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`
		_, err = db.Exec(insertQuery,
			"usr-admin-01",
			"Administrador Master",
			"admin@solcrm.com.br",
			string(models.RoleAdmin),
			"Diretoria & Governança",
			hash,
			true,
			"(11) 99999-0001",
			now,
			now,
		)
		if err != nil {
			return fmt.Errorf("erro ao semear admin: %w", err)
		}
		log.Println("✅ Administrador semeado com sucesso no PostgreSQL!")
	}

	return nil
}

func hashPassword(plain string) string {
	salt := "sol-crm-salt-2026-secure"
	h := sha256.New()
	h.Write([]byte(plain + salt))
	return fmt.Sprintf("%x", h.Sum(nil))
}

// CheckPassword valida se a senha bate com o hash
func CheckPassword(plain, hashed string) bool {
	return hashPassword(plain) == hashed
}

// User methods no PostgreSQL
func (db *DB) GetUserByEmail(email string) (*models.User, error) {
	cleanEmail := strings.ToLower(strings.TrimSpace(email))
	query := `
	SELECT id, name, email, role, department, password_hash, active, COALESCE(phone, ''), created_at, COALESCE(last_login, now())
	FROM users WHERE LOWER(email) = $1
	`
	row := db.QueryRow(query, cleanEmail)

	var u models.User
	var roleStr string
	err := row.Scan(&u.ID, &u.Name, &u.Email, &roleStr, &u.Department, &u.PasswordHash, &u.Active, &u.Phone, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		return nil, err
	}
	u.Role = models.UserRole(roleStr)
	return &u, nil
}

func (db *DB) GetUserByID(id string) (*models.User, error) {
	query := `
	SELECT id, name, email, role, department, password_hash, active, COALESCE(phone, ''), created_at, COALESCE(last_login, now())
	FROM users WHERE id = $1
	`
	row := db.QueryRow(query, id)

	var u models.User
	var roleStr string
	err := row.Scan(&u.ID, &u.Name, &u.Email, &roleStr, &u.Department, &u.PasswordHash, &u.Active, &u.Phone, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		return nil, err
	}
	u.Role = models.UserRole(roleStr)
	return &u, nil
}

func (db *DB) ListUsers() ([]*models.User, error) {
	query := `
	SELECT id, name, email, role, department, active, COALESCE(phone, ''), created_at, COALESCE(last_login, now())
	FROM users ORDER BY created_at ASC
	`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		var u models.User
		var roleStr string
		err := rows.Scan(&u.ID, &u.Name, &u.Email, &roleStr, &u.Department, &u.Active, &u.Phone, &u.CreatedAt, &u.LastLogin)
		if err != nil {
			return nil, err
		}
		u.Role = models.UserRole(roleStr)
		users = append(users, &u)
	}
	return users, nil
}

func (db *DB) CreateUser(u *models.User, password string) error {
	hash := hashPassword(password)
	query := `
	INSERT INTO users (id, name, email, role, department, password_hash, active, phone, created_at, last_login)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := db.Exec(query, u.ID, u.Name, strings.ToLower(u.Email), string(u.Role), u.Department, hash, u.Active, u.Phone, u.CreatedAt, u.LastLogin)
	return err
}

func (db *DB) UpdateUser(id, name, email, role, department, phone string, active bool) (*models.User, error) {
	query := `
	UPDATE users
	SET name = $2, email = $3, role = $4, department = $5, phone = $6, active = $7
	WHERE id = $1
	RETURNING id, name, email, role, department, active, COALESCE(phone, ''), created_at, COALESCE(last_login, now())
	`
	var u models.User
	var roleStr string
	err := db.QueryRow(query, id, name, strings.ToLower(email), role, department, phone, active).
		Scan(&u.ID, &u.Name, &u.Email, &roleStr, &u.Department, &u.Active, &u.Phone, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		return nil, err
	}
	u.Role = models.UserRole(roleStr)
	return &u, nil
}

func (db *DB) UpdateLastLogin(id string) error {
	_, err := db.Exec("UPDATE users SET last_login = NOW() WHERE id = $1", id)
	return err
}

func (db *DB) UpdateUserProfile(id, name, phone, department string) (*models.User, error) {
	query := `
	UPDATE users
	SET name = $2, phone = $3, department = $4
	WHERE id = $1
	RETURNING id, name, email, role, department, active, COALESCE(phone, ''), created_at, COALESCE(last_login, now())
	`
	var u models.User
	var roleStr string
	err := db.QueryRow(query, id, name, phone, department).
		Scan(&u.ID, &u.Name, &u.Email, &roleStr, &u.Department, &u.Active, &u.Phone, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		return nil, err
	}
	u.Role = models.UserRole(roleStr)
	return &u, nil
}

func (db *DB) ChangePassword(id, oldPassword, newPassword string) error {
	var currentHash string
	err := db.QueryRow("SELECT password_hash FROM users WHERE id = $1", id).Scan(&currentHash)
	if err != nil {
		return err
	}

	if !CheckPassword(oldPassword, currentHash) {
		return fmt.Errorf("senha atual incorreta")
	}

	newHash := hashPassword(newPassword)
	_, err = db.Exec("UPDATE users SET password_hash = $2 WHERE id = $1", id, newHash)
	return err
}

// DefaultSettings retorna o conjunto padrão de configurações e o fluxo visual idêntico ao solicitado
func DefaultSettings() *models.ChatSettings {
	return &models.ChatSettings{
		CloseMessage:         "Atendimento encerrado com sucesso! Agradecemos o seu contato. Caso precise de mais ajuda, basta nos enviar uma nova mensagem.",
		WelcomeMessage:       "Olá! Seja bem-vindo à nossa central de atendimento. Escolha uma das opções abaixo para iniciarmos seu atendimento:",
		QueueTransferMessage: "Transferindo você para a nossa equipe de atendimento. Por favor, aguarde um instante na fila.",
		OutOfHoursMessage:    "Nosso expediente está encerrado no momento. Nosso horário de atendimento é de segunda a sexta, das 08h às 18h.",
		EnableBotFlow:        true,
		AIEnabled:            false,
		AIPrompt:             "Você é o assistente virtual inteligente da SOL CRM. Seja gentil, objetivo e ajude o cliente com dúvidas sobre serviços, faturas e suporte técnico.",
		BotTimeoutMinutes:    3,
		BotFallbackDept:      "Suporte Técnico",
		ChatbotFlow: &models.FlowNode{
			ID:      "root",
			Title:   "Mensagem Inicial",
			Emoji:   "▶️",
			Message: "Olá! Seja bem-vindo à nossa central de atendimento. Escolha uma opção para continuarmos:",
			Action:  models.FlowActionSubmenu,
			Children: []*models.FlowNode{
				{
					ID:      "node-quero-ser-cliente",
					Title:   "QUERO SER CLIENTE",
					Emoji:   "💬",
					Message: "Que ótimo que você quer fazer parte da nossa família! Escolha uma opção:",
					Action:  models.FlowActionSubmenu,
					Children: []*models.FlowNode{
						{
							ID:         "node-contratar-agora",
							Title:      "1 - Contratar Agora",
							Emoji:      "🔁",
							Message:    "Perfeito! Vou te transferir para um especialista comercial para apresentar nossos planos.",
							Action:     models.FlowActionTransfer,
							Department: "Comercial",
						},
						{
							ID:      "node-voltar-inicio",
							Title:   "2 - Voltar",
							Emoji:   "🔙",
							Message: "Voltando ao menu principal...",
							Action:  models.FlowActionSubmenu,
						},
					},
				},
				{
					ID:      "node-encerrar",
					Title:   "Encerrar Atendimento",
					Emoji:   "👋 🌐",
					Message: "Atendimento encerrado a pedido do cliente. Obrigado pelo contato!",
					Action:  models.FlowActionClose,
				},
				{
					ID:      "node-ja-sou-cliente",
					Title:   "JÁ SOU CLIENTE",
					Emoji:   "😀",
					Message: "Olá assinante! O que você gostaria de resolver hoje?",
					Action:  models.FlowActionSubmenu,
					Children: []*models.FlowNode{
						{
							ID:      "node-financeiro",
							Title:   "1 - FINANCEIRO",
							Emoji:   "💬",
							Message: "Setor Financeiro. Selecione a opção desejada:",
							Action:  models.FlowActionSubmenu,
							Children: []*models.FlowNode{
								{
									ID:        "node-fin-2via",
									Title:     "1 - 2ª VIA DE BOLETO",
									Emoji:     "💵",
									Message:   "Localizamos sua fatura no ERP. Segue o código PIX para pagamento: 00020126580014br.gov.bcb.pix...",
									Action:    models.FlowActionERP,
									ERPAction: "2via_boleto",
								},
								{
									ID:        "node-fin-promessa",
									Title:     "2 - PROMESSA DE PAGAMENTO",
									Emoji:     "🙏",
									Message:   "Sua promessa de pagamento foi aceita no ERP! O desbloqueio em confiança de 48h foi liberado com sucesso.",
									Action:    models.FlowActionERP,
									ERPAction: "promessa_pagamento",
								},
								{
									ID:         "node-fin-atendente",
									Title:      "3 - FALAR COM ATENDENTE",
									Emoji:      "🔁",
									Message:    "Transferindo você para um operador do setor Financeiro...",
									Action:     models.FlowActionTransfer,
									Department: "Financeiro",
								},
							},
						},
						{
							ID:      "node-suporte",
							Title:   "2 - SUPORTE",
							Emoji:   "💬",
							Message: "Suporte Técnico. Qual é o sintoma da sua conexão?",
							Action:  models.FlowActionSubmenu,
							Children: []*models.FlowNode{
								{
									ID:      "node-sup-sem-acesso",
									Title:   "1 - Sem Acesso",
									Emoji:   "⚠️",
									Message: "Por favor, reinicie seu roteador da tomada por 10 segundos e aguarde as luzes estabilizarem.",
									Action:  models.FlowActionSubmenu,
									Children: []*models.FlowNode{
										{
											ID:      "node-sup-sem-resolvido",
											Title:   "1 - Problema Resolvido",
											Emoji:   "👋 ✅",
											Message: "Que excelente notícia! Conte sempre conosco.",
											Action:  models.FlowActionClose,
										},
										{
											ID:         "node-sup-sem-continua",
											Title:      "2 - Problema Continua",
											Emoji:      "🔁 ⚠️",
											Message:    "Encaminhando você para um técnico com prioridade para análise de sinal.",
											Action:     models.FlowActionTransfer,
											Department: "Suporte Técnico",
										},
										{
											ID:         "node-sup-sem-sos",
											Title:      "3 - Sem Acesso Urgente",
											Emoji:      "🆘",
											Message:    "Chamado urgente aberto. Um atendente de suporte especializado atenderá em instantes.",
											Action:     models.FlowActionTransfer,
											Department: "Suporte Técnico",
										},
									},
								},
								{
									ID:      "node-sup-lenta",
									Title:   "2 - Internet Lenta",
									Emoji:   "🔽",
									Message: "Vamos analisar sua lentidão. O sinal óptico está operando. Como deseja prosseguir?",
									Action:  models.FlowActionSubmenu,
									Children: []*models.FlowNode{
										{
											ID:      "node-sup-lenta-resolvido",
											Title:   "1 - Problema Resolvido",
											Emoji:   "👋 ✅",
											Message: "Ótimo! Qualquer nova instabilidade nos avise.",
											Action:  models.FlowActionClose,
										},
										{
											ID:         "node-sup-lenta-continua",
											Title:      "2 - Problema Continua",
											Emoji:      "🔁 ⚠️",
											Message:    "Transferindo para teste de velocidade avançado e troca de canal Wi-Fi...",
											Action:     models.FlowActionTransfer,
											Department: "Suporte Técnico",
										},
										{
											ID:         "node-sup-lenta-sos",
											Title:      "3 - Internet Lenta Urgente",
											Emoji:      "🆘",
											Message:    "Transferindo para fila prioritária de diagnóstico técnico.",
											Action:     models.FlowActionTransfer,
											Department: "Suporte Técnico",
										},
									},
								},
							},
						},
						{
							ID:         "node-atendente-geral",
							Title:      "3 - FALAR COM ATENDENTE",
							Emoji:      "🔁",
							Message:    "Transferindo para um atendente da equipe...",
							Action:     models.FlowActionTransfer,
							Department: "Suporte Técnico",
						},
						{
							ID:        "node-cliente-boleto-rapido",
							Title:     "6 - 2ª VIA DE BOLETO",
							Emoji:     "💵",
							Message:   "Buscando fatura no ERP... Código PIX Copia e Cola gerado com sucesso!",
							Action:    models.FlowActionERP,
							ERPAction: "2via_boleto",
						},
						{
							ID:        "node-cliente-promessa-rapida",
							Title:     "7 - PROMESSA DE PAGAMENTO",
							Emoji:     "🙏",
							Message:   "Desbloqueio em confiança de 48h liberado no ERP.",
							Action:    models.FlowActionERP,
							ERPAction: "promessa_pagamento",
						},
					},
				},
			},
		},
	}
}

func (db *DB) seedDefaultSettings() error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM chat_settings WHERE key = 'main'").Scan(&count)
	if err != nil {
		return err
	}

	if count == 0 {
		log.Println("⚙️ Semeando configurações de chat e fluxo padrão no PostgreSQL...")
		defaults := DefaultSettings()
		bytes, err := json.Marshal(defaults)
		if err != nil {
			return err
		}

		_, err = db.Exec("INSERT INTO chat_settings (key, value, updated_at) VALUES ('main', $1, NOW())", bytes)
		if err != nil {
			return fmt.Errorf("erro ao semear configurações: %w", err)
		}
		log.Println("✅ Configurações de chat semeadas com sucesso!")
	}

	return nil
}

// GetChatSettings busca todas as configurações do chat do PostgreSQL
func (db *DB) GetChatSettings() (*models.ChatSettings, error) {
	var rawJSON []byte
	err := db.QueryRow("SELECT value FROM chat_settings WHERE key = 'main'").Scan(&rawJSON)
	if err != nil {
		if err == sql.ErrNoRows {
			return DefaultSettings(), nil
		}
		return nil, err
	}

	var settings models.ChatSettings
	if err := json.Unmarshal(rawJSON, &settings); err != nil {
		return DefaultSettings(), nil
	}

	if settings.BotTimeoutMinutes <= 0 {
		settings.BotTimeoutMinutes = 3
	}
	if strings.TrimSpace(settings.BotFallbackDept) == "" {
		settings.BotFallbackDept = "Suporte Técnico"
	}

	return &settings, nil
}

// SaveChatSettings salva configurações de chat no PostgreSQL
func (db *DB) SaveChatSettings(settings *models.ChatSettings) error {
	bytes, err := json.Marshal(settings)
	if err != nil {
		return fmt.Errorf("erro ao serializar configurações: %w", err)
	}

	query := `
	INSERT INTO chat_settings (key, value, updated_at)
	VALUES ('main', $1, NOW())
	ON CONFLICT (key) DO UPDATE
	SET value = EXCLUDED.value, updated_at = NOW()
	`
	_, err = db.Exec(query, bytes)
	return err
}

// GetCloseMessage retorna a mensagem de encerramento configurada
func (db *DB) GetCloseMessage() string {
	settings, err := db.GetChatSettings()
	if err != nil || settings.CloseMessage == "" {
		return "Atendimento encerrado com sucesso! Agradecemos o seu contato."
	}
	return settings.CloseMessage
}

// DefaultRBXConfig retorna as configurações padrão para o RBX Soft ISP
func DefaultRBXConfig() *models.RBXConfig {
	return &models.RBXConfig{
		BaseURL:        "https://provedor.rbxsoft.com/routerbox/ws_json/ws_json.php",
		ApiKey:         "UAHS531AUSHUQ727182HNUHE18H37H",
		Version:        "v1",
		Enabled:        true,
		SimulationMode: true, // fallback transparente com dados realistas se o servidor estiver offline
	}
}

// GetRBXConfig busca as configurações do RBX do banco PostgreSQL
func (db *DB) GetRBXConfig() (*models.RBXConfig, error) {
	var rawJSON []byte
	err := db.QueryRow("SELECT value FROM chat_settings WHERE key = 'rbx_config'").Scan(&rawJSON)
	if err != nil {
		if err == sql.ErrNoRows {
			return DefaultRBXConfig(), nil
		}
		return nil, err
	}

	var cfg models.RBXConfig
	if err := json.Unmarshal(rawJSON, &cfg); err != nil {
		return DefaultRBXConfig(), nil
	}

	return &cfg, nil
}

// SaveRBXConfig salva as configurações do RBX no PostgreSQL
func (db *DB) SaveRBXConfig(cfg *models.RBXConfig) error {
	bytes, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("erro ao serializar config rbx: %w", err)
	}

	query := `
	INSERT INTO chat_settings (key, value, updated_at)
	VALUES ('rbx_config', $1, NOW())
	ON CONFLICT (key) DO UPDATE
	SET value = EXCLUDED.value, updated_at = NOW()
	`
	_, err = db.Exec(query, bytes)
	return err
}

// SaveCustomerNetwork persiste OLT, PON e CTO para um CPF
func (db *DB) SaveCustomerNetwork(cpfCnpj, olt, pon, cto string) error {
	clean := strings.TrimSpace(cpfCnpj)
	if clean == "" {
		return nil
	}
	query := `
	INSERT INTO customer_network (cpf_cnpj, olt, pon, cto, updated_at)
	VALUES ($1, $2, $3, $4, NOW())
	ON CONFLICT (cpf_cnpj) DO UPDATE
	SET olt = EXCLUDED.olt, pon = EXCLUDED.pon, cto = EXCLUDED.cto, updated_at = NOW()
	`
	_, err := db.Exec(query, clean, strings.TrimSpace(olt), strings.TrimSpace(pon), strings.TrimSpace(cto))
	return err
}

// GetCustomerNetwork busca OLT, PON e CTO salvas para um CPF
func (db *DB) GetCustomerNetwork(cpfCnpj string) (string, string, string, error) {
	clean := strings.TrimSpace(cpfCnpj)
	if clean == "" {
		return "", "", "", nil
	}
	query := `SELECT olt, pon, cto FROM customer_network WHERE cpf_cnpj = $1`
	var olt, pon, cto string
	err := db.QueryRow(query, clean).Scan(&olt, &pon, &cto)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", "", "", nil
		}
		return "", "", "", err
	}
	return olt, pon, cto, nil
}

// UpsertDevice salva ou atualiza o aparelho móvel com OLT, PON e CTO
func (db *DB) UpsertDevice(dev *models.DeviceRegistration) error {
	if dev.DeviceID == "" {
		return nil
	}
	query := `
	INSERT INTO devices (device_id, cpf_cnpj, client_name, platform, push_token, app_version, olt, pon, cto, rbx_group, last_seen_at, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	ON CONFLICT (device_id) DO UPDATE
	SET cpf_cnpj = CASE WHEN EXCLUDED.cpf_cnpj != '' THEN EXCLUDED.cpf_cnpj ELSE devices.cpf_cnpj END,
	    client_name = CASE WHEN EXCLUDED.client_name != '' THEN EXCLUDED.client_name ELSE devices.client_name END,
	    platform = CASE WHEN EXCLUDED.platform != '' THEN EXCLUDED.platform ELSE devices.platform END,
	    push_token = CASE WHEN EXCLUDED.push_token != '' THEN EXCLUDED.push_token ELSE devices.push_token END,
	    app_version = CASE WHEN EXCLUDED.app_version != '' THEN EXCLUDED.app_version ELSE devices.app_version END,
	    olt = CASE WHEN EXCLUDED.olt != '' THEN EXCLUDED.olt ELSE devices.olt END,
	    pon = CASE WHEN EXCLUDED.pon != '' THEN EXCLUDED.pon ELSE devices.pon END,
	    cto = CASE WHEN EXCLUDED.cto != '' THEN EXCLUDED.cto ELSE devices.cto END,
	    rbx_group = CASE WHEN EXCLUDED.rbx_group != '' THEN EXCLUDED.rbx_group ELSE devices.rbx_group END,
	    last_seen_at = EXCLUDED.last_seen_at
	`
	_, err := db.Exec(query,
		dev.DeviceID,
		dev.CpfCnpj,
		dev.ClientName,
		dev.Platform,
		dev.PushToken,
		dev.AppVersion,
		dev.OLT,
		dev.PON,
		dev.CTO,
		dev.RbxGroup,
		dev.LastSeenAt,
		dev.CreatedAt,
	)
	return err
}

// ListDevices lista os aparelhos registrados salvos no PostgreSQL
func (db *DB) ListDevices() ([]*models.DeviceRegistration, error) {
	query := `
	SELECT device_id, cpf_cnpj, client_name, platform, push_token, app_version, olt, pon, cto, rbx_group, last_seen_at, created_at
	FROM devices
	ORDER BY last_seen_at DESC
	`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*models.DeviceRegistration, 0)
	for rows.Next() {
		var dev models.DeviceRegistration
		err := rows.Scan(
			&dev.DeviceID,
			&dev.CpfCnpj,
			&dev.ClientName,
			&dev.Platform,
			&dev.PushToken,
			&dev.AppVersion,
			&dev.OLT,
			&dev.PON,
			&dev.CTO,
			&dev.RbxGroup,
			&dev.LastSeenAt,
			&dev.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		list = append(list, &dev)
	}
	return list, nil
}

// seedDefaultNetwork cria infraestrutura inicial de exemplo se a tabela de OLTs estiver vazia
func (db *DB) seedDefaultNetwork() error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM network_olts").Scan(&count)
	if err != nil || count > 0 {
		return err
	}

	oltID := "olt-central-01"
	slotID := "slot-central-01"
	ponID := "pon-central-01"

	// 1. OLT
	_, err = db.Exec(`
		INSERT INTO network_olts (id, name, model, ip, location, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
	`, oltID, "OLT-CENTRAL-01", "Huawei SmartAX MA5608T", "10.0.10.1", "POP Central", "OLT principal de distribuição urbana")
	if err != nil {
		return err
	}

	// 2. SLOT
	_, err = db.Exec(`
		INSERT INTO network_slots (id, olt_id, slot_number, name, card_type, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`, slotID, oltID, 1, "Slot 01 - GPFD", "Huawei GPFD 16P")
	if err != nil {
		return err
	}

	// 3. PON
	_, err = db.Exec(`
		INSERT INTO network_pons (id, slot_id, olt_id, pon_number, name, sfp_type, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`, ponID, slotID, oltID, 1, "PON 1/1", "Class C++ (7.5dBm)")
	if err != nil {
		return err
	}

	// 4. CTOs
	_, _ = db.Exec(`
		INSERT INTO network_ctos (id, pon_id, slot_id, olt_id, name, splitter_ratio, total_ports, address, coordinates, notes, created_at)
		VALUES 
		('cto-01', $1, $2, $3, 'CTO-01', '1:16', 16, 'Av. Brasil, poste 12 - Centro', '-1.2345, -48.1234', 'Caixa primária de atendimento', NOW()),
		('cto-02', $1, $2, $3, 'CTO-02', '1:16', 16, 'Rua das Flores, poste 08 - Centro', '-1.2350, -48.1240', 'Derivação secundária', NOW())
	`, ponID, slotID, oltID)

	log.Println("🌳 Infraestrutura FTTH inicial semeada com sucesso no PostgreSQL!")
	return nil
}

// GetNetworkTree retorna a árvore completa de OLTs -> Slots -> PONs -> CTOs
func (db *DB) GetNetworkTree() ([]*models.NetworkOlt, error) {
	// 1. Busca todas as OLTs
	oltRows, err := db.Query(`
		SELECT id, name, model, ip, location, description, created_at, updated_at
		FROM network_olts
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("erro ao consultar OLTs: %w", err)
	}
	defer oltRows.Close()

	olts := make([]*models.NetworkOlt, 0)
	oltMap := make(map[string]*models.NetworkOlt)

	for oltRows.Next() {
		o := &models.NetworkOlt{}
		if err := oltRows.Scan(&o.ID, &o.Name, &o.Model, &o.IP, &o.Location, &o.Description, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		o.Slots = make([]*models.NetworkSlot, 0)
		olts = append(olts, o)
		oltMap[o.ID] = o
	}

	// 2. Busca todos os Slots
	slotRows, err := db.Query(`
		SELECT id, olt_id, slot_number, name, card_type, created_at
		FROM network_slots
		ORDER BY slot_number ASC, name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("erro ao consultar Slots: %w", err)
	}
	defer slotRows.Close()

	slotMap := make(map[string]*models.NetworkSlot)
	for slotRows.Next() {
		s := &models.NetworkSlot{}
		if err := slotRows.Scan(&s.ID, &s.OltID, &s.SlotNumber, &s.Name, &s.CardType, &s.CreatedAt); err != nil {
			return nil, err
		}
		s.Pons = make([]*models.NetworkPon, 0)
		slotMap[s.ID] = s
		if parentOlt, ok := oltMap[s.OltID]; ok {
			parentOlt.Slots = append(parentOlt.Slots, s)
		}
	}

	// 3. Busca todas as PONs
	ponRows, err := db.Query(`
		SELECT id, slot_id, olt_id, pon_number, name, sfp_type, created_at
		FROM network_pons
		ORDER BY pon_number ASC, name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("erro ao consultar PONs: %w", err)
	}
	defer ponRows.Close()

	ponMap := make(map[string]*models.NetworkPon)
	for ponRows.Next() {
		p := &models.NetworkPon{}
		if err := ponRows.Scan(&p.ID, &p.SlotID, &p.OltID, &p.PonNumber, &p.Name, &p.SfpType, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.Ctos = make([]*models.NetworkCto, 0)
		ponMap[p.ID] = p
		if parentSlot, ok := slotMap[p.SlotID]; ok {
			parentSlot.Pons = append(parentSlot.Pons, p)
		}
	}

	// 4. Busca todas as CTOs
	ctoRows, err := db.Query(`
		SELECT id, pon_id, slot_id, olt_id, name, splitter_ratio, total_ports, address, coordinates, notes, created_at
		FROM network_ctos
		ORDER BY name ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("erro ao consultar CTOs: %w", err)
	}
	defer ctoRows.Close()

	for ctoRows.Next() {
		c := &models.NetworkCto{}
		if err := ctoRows.Scan(&c.ID, &c.PonID, &c.SlotID, &c.OltID, &c.Name, &c.SplitterRatio, &c.TotalPorts, &c.Address, &c.Coordinates, &c.Notes, &c.CreatedAt); err != nil {
			return nil, err
		}
		if parentPon, ok := ponMap[c.PonID]; ok {
			parentPon.Ctos = append(parentPon.Ctos, c)
		}
	}

	return olts, nil
}

// CreateOlt cadastra uma nova OLT
func (db *DB) CreateOlt(olt *models.NetworkOlt) error {
	query := `
		INSERT INTO network_olts (id, name, model, ip, location, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := db.Exec(query, olt.ID, olt.Name, olt.Model, olt.IP, olt.Location, olt.Description, olt.CreatedAt, olt.UpdatedAt)
	return err
}

// UpdateOlt atualiza dados de uma OLT
func (db *DB) UpdateOlt(olt *models.NetworkOlt) error {
	query := `
		UPDATE network_olts
		SET name = $1, model = $2, ip = $3, location = $4, description = $5, updated_at = NOW()
		WHERE id = $6
	`
	_, err := db.Exec(query, olt.Name, olt.Model, olt.IP, olt.Location, olt.Description, olt.ID)
	return err
}

// DeleteOlt remove uma OLT (em cascata no banco)
func (db *DB) DeleteOlt(id string) error {
	_, err := db.Exec("DELETE FROM network_olts WHERE id = $1", id)
	return err
}

// CreateSlot cadastra um novo Slot de placa PON
func (db *DB) CreateSlot(slot *models.NetworkSlot) error {
	query := `
		INSERT INTO network_slots (id, olt_id, slot_number, name, card_type, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := db.Exec(query, slot.ID, slot.OltID, slot.SlotNumber, slot.Name, slot.CardType, slot.CreatedAt)
	return err
}

// UpdateSlot atualiza dados de um Slot
func (db *DB) UpdateSlot(slot *models.NetworkSlot) error {
	query := `
		UPDATE network_slots
		SET slot_number = $1, name = $2, card_type = $3
		WHERE id = $4
	`
	_, err := db.Exec(query, slot.SlotNumber, slot.Name, slot.CardType, slot.ID)
	return err
}

// DeleteSlot remove um Slot (em cascata no banco)
func (db *DB) DeleteSlot(id string) error {
	_, err := db.Exec("DELETE FROM network_slots WHERE id = $1", id)
	return err
}

// CreatePon cadastra uma nova porta PON
func (db *DB) CreatePon(pon *models.NetworkPon) error {
	query := `
		INSERT INTO network_pons (id, slot_id, olt_id, pon_number, name, sfp_type, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := db.Exec(query, pon.ID, pon.SlotID, pon.OltID, pon.PonNumber, pon.Name, pon.SfpType, pon.CreatedAt)
	return err
}

// UpdatePon atualiza dados de uma porta PON
func (db *DB) UpdatePon(pon *models.NetworkPon) error {
	query := `
		UPDATE network_pons
		SET pon_number = $1, name = $2, sfp_type = $3
		WHERE id = $4
	`
	_, err := db.Exec(query, pon.PonNumber, pon.Name, pon.SfpType, pon.ID)
	return err
}

// DeletePon remove uma porta PON (em cascata no banco)
func (db *DB) DeletePon(id string) error {
	_, err := db.Exec("DELETE FROM network_pons WHERE id = $1", id)
	return err
}

// GetPon busca uma porta PON por ID
func (db *DB) GetPon(id string) (*models.NetworkPon, error) {
	query := `SELECT id, slot_id, olt_id, pon_number, name, sfp_type, created_at FROM network_pons WHERE id = $1`
	var p models.NetworkPon
	err := db.QueryRow(query, id).Scan(&p.ID, &p.SlotID, &p.OltID, &p.PonNumber, &p.Name, &p.SfpType, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// CreateCto cadastra uma nova CTO pertencente a uma PON (autoresolve slot_id e olt_id se omitidos)
func (db *DB) CreateCto(cto *models.NetworkCto) error {
	if cto.SlotID == "" || cto.OltID == "" {
		if pon, err := db.GetPon(cto.PonID); err == nil && pon != nil {
			cto.SlotID = pon.SlotID
			cto.OltID = pon.OltID
		}
	}
	query := `
		INSERT INTO network_ctos (id, pon_id, slot_id, olt_id, name, splitter_ratio, total_ports, address, coordinates, notes, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err := db.Exec(query, cto.ID, cto.PonID, cto.SlotID, cto.OltID, cto.Name, cto.SplitterRatio, cto.TotalPorts, cto.Address, cto.Coordinates, cto.Notes, cto.CreatedAt)
	return err
}

// CreateCtosBatch cadastra múltiplas CTOs em lote para uma PON
func (db *DB) CreateCtosBatch(ctos []*models.NetworkCto) error {
	if len(ctos) == 0 {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO network_ctos (id, pon_id, slot_id, olt_id, name, splitter_ratio, total_ports, address, coordinates, notes, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, cto := range ctos {
		_, err := stmt.Exec(cto.ID, cto.PonID, cto.SlotID, cto.OltID, cto.Name, cto.SplitterRatio, cto.TotalPorts, cto.Address, cto.Coordinates, cto.Notes, cto.CreatedAt)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// UpdateCto atualiza dados de uma CTO
func (db *DB) UpdateCto(cto *models.NetworkCto) error {
	query := `
		UPDATE network_ctos
		SET name = $1, splitter_ratio = $2, total_ports = $3, address = $4, coordinates = $5, notes = $6
		WHERE id = $7
	`
	_, err := db.Exec(query, cto.Name, cto.SplitterRatio, cto.TotalPorts, cto.Address, cto.Coordinates, cto.Notes, cto.ID)
	return err
}

// DeleteCto remove uma CTO
func (db *DB) DeleteCto(id string) error {
	_, err := db.Exec("DELETE FROM network_ctos WHERE id = $1", id)
	return err
}

// ==========================================
// PERSISTÊNCIA DE CONVERSAS E MENSAGENS (CHAT)
// ==========================================

func scanConversationRow(scanner interface{ Scan(dest ...any) error }) (*models.Conversation, error) {
	var conv models.Conversation
	var opID, opName, statusStr string
	var rbxGroup, closedBy, closeReason, ratingComment, channel, channelID, channelMeta sql.NullString
	var botStep, botNodeID sql.NullString
	var assignedAt, closedAt, ratedAt sql.NullTime
	var rating sql.NullInt32

	err := scanner.Scan(
		&conv.ID, &conv.ClientID, &conv.ClientName, &conv.ContactName, &conv.CpfCnpj,
		&conv.Department, &rbxGroup, &statusStr, &opID, &opName, &conv.OLT, &conv.PON, &conv.CTO,
		&conv.CreatedAt, &conv.UpdatedAt,
		&assignedAt, &closedAt, &closedBy, &closeReason, &rating, &ratingComment, &ratedAt,
		&channel, &channelID, &channelMeta,
		&botStep, &botNodeID,
	)
	if err != nil {
		return nil, err
	}
	conv.Status = models.ConversationStatus(statusStr)
	if rbxGroup.Valid {
		conv.RbxGroup = rbxGroup.String
	}
	if opID != "" || opName != "" {
		conv.Operator = &models.OperatorInfo{
			ID:   opID,
			Name: opName,
		}
	}
	if assignedAt.Valid {
		conv.AssignedAt = &assignedAt.Time
	}
	if closedAt.Valid {
		conv.ClosedAt = &closedAt.Time
	}
	if closedBy.Valid {
		conv.ClosedBy = closedBy.String
	}
	if closeReason.Valid {
		conv.CloseReason = closeReason.String
	}
	if rating.Valid {
		r := int(rating.Int32)
		conv.Rating = &r
	}
	if ratingComment.Valid {
		conv.RatingComment = ratingComment.String
	}
	if ratedAt.Valid {
		conv.RatedAt = &ratedAt.Time
	}

	conv.Channel = "mobile"
	if channel.Valid && channel.String != "" {
		conv.Channel = channel.String
	}
	if channelID.Valid {
		conv.ChannelID = channelID.String
	}
	if channelMeta.Valid {
		conv.ChannelMeta = channelMeta.String
	}
	if botStep.Valid {
		conv.BotStep = botStep.String
	}
	if botNodeID.Valid {
		conv.BotNodeID = botNodeID.String
	}

	return &conv, nil
}

// UpsertConversation salva ou atualiza uma conversa no PostgreSQL
func (db *DB) UpsertConversation(conv *models.Conversation) error {
	if conv == nil || conv.ID == "" {
		return nil
	}
	opID := ""
	opName := ""
	if conv.Operator != nil {
		opID = conv.Operator.ID
		opName = conv.Operator.Name
	}
	ch := conv.Channel
	if ch == "" {
		ch = "mobile"
	}
	query := `
	INSERT INTO conversations (
		id, client_id, client_name, contact_name, cpf_cnpj, department, rbx_group, status,
		operator_id, operator_name, olt, pon, cto, created_at, updated_at,
		assigned_at, closed_at, closed_by, close_reason, rating, rating_comment, rated_at,
		channel, channel_id, channel_meta, bot_step, bot_node_id
	) VALUES (
		$1, $2, $3, $4, $5, $6, $7, $8,
		$9, $10, $11, $12, $13, $14, $15,
		$16, $17, $18, $19, $20, $21, $22,
		$23, $24, $25, $26, $27
	)
	ON CONFLICT (id) DO UPDATE SET
		client_name = EXCLUDED.client_name,
		contact_name = EXCLUDED.contact_name,
		cpf_cnpj = CASE WHEN EXCLUDED.cpf_cnpj != '' THEN EXCLUDED.cpf_cnpj ELSE conversations.cpf_cnpj END,
		department = EXCLUDED.department,
		rbx_group = CASE WHEN EXCLUDED.rbx_group != '' THEN EXCLUDED.rbx_group ELSE conversations.rbx_group END,
		status = EXCLUDED.status,
		operator_id = EXCLUDED.operator_id,
		operator_name = EXCLUDED.operator_name,
		olt = CASE WHEN EXCLUDED.olt != '' THEN EXCLUDED.olt ELSE conversations.olt END,
		pon = CASE WHEN EXCLUDED.pon != '' THEN EXCLUDED.pon ELSE conversations.pon END,
		cto = CASE WHEN EXCLUDED.cto != '' THEN EXCLUDED.cto ELSE conversations.cto END,
		assigned_at = COALESCE(EXCLUDED.assigned_at, conversations.assigned_at),
		closed_at = COALESCE(EXCLUDED.closed_at, conversations.closed_at),
		closed_by = CASE WHEN EXCLUDED.closed_by != '' THEN EXCLUDED.closed_by ELSE conversations.closed_by END,
		close_reason = CASE WHEN EXCLUDED.close_reason != '' THEN EXCLUDED.close_reason ELSE conversations.close_reason END,
		rating = COALESCE(EXCLUDED.rating, conversations.rating),
		rating_comment = CASE WHEN EXCLUDED.rating_comment != '' THEN EXCLUDED.rating_comment ELSE conversations.rating_comment END,
		rated_at = COALESCE(EXCLUDED.rated_at, conversations.rated_at),
		channel = CASE WHEN EXCLUDED.channel != '' AND EXCLUDED.channel != 'mobile' THEN EXCLUDED.channel WHEN conversations.channel != '' THEN conversations.channel ELSE 'mobile' END,
		channel_id = CASE WHEN EXCLUDED.channel_id != '' THEN EXCLUDED.channel_id ELSE conversations.channel_id END,
		channel_meta = CASE WHEN EXCLUDED.channel_meta != '' THEN EXCLUDED.channel_meta ELSE conversations.channel_meta END,
		bot_step = EXCLUDED.bot_step,
		bot_node_id = EXCLUDED.bot_node_id,
		updated_at = EXCLUDED.updated_at;
	`
	_, err := db.Exec(query,
		conv.ID, conv.ClientID, conv.ClientName, conv.ContactName, conv.CpfCnpj, conv.Department, conv.RbxGroup, string(conv.Status),
		opID, opName, conv.OLT, conv.PON, conv.CTO, conv.CreatedAt, conv.UpdatedAt,
		conv.AssignedAt, conv.ClosedAt, conv.ClosedBy, conv.CloseReason, conv.Rating, conv.RatingComment, conv.RatedAt,
		ch, conv.ChannelID, conv.ChannelMeta, conv.BotStep, conv.BotNodeID,
	)
	return err
}

// GetConversationByID busca uma conversa específica no banco
func (db *DB) GetConversationByID(id string) (*models.Conversation, error) {
	query := `
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, rbx_group, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at,
	       assigned_at, closed_at, closed_by, close_reason, rating, rating_comment, rated_at,
	       channel, channel_id, channel_meta, bot_step, bot_node_id
	FROM conversations WHERE id = $1;
	`
	row := db.QueryRow(query, id)
	return scanConversationRow(row)
}

// ListConversations retorna todas as conversas do banco, com filtros opcionais de status e CPF/CNPJ
func (db *DB) ListConversations(status models.ConversationStatus, cpfCnpj string) ([]*models.Conversation, error) {
	query := `
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, rbx_group, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at,
	       assigned_at, closed_at, closed_by, close_reason, rating, rating_comment, rated_at,
	       channel, channel_id, channel_meta, bot_step, bot_node_id
	FROM conversations
	WHERE ($1 = '' OR status = $1 OR ($1 = 'closed' AND status = 'waiting_rating') OR ($1 = 'waiting' AND status = 'bot'))
	  AND ($2 = '' OR cpf_cnpj = $2)
	ORDER BY updated_at DESC;
	`
	rows, err := db.Query(query, string(status), strings.TrimSpace(cpfCnpj))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*models.Conversation, 0)
	for rows.Next() {
		conv, err := scanConversationRow(rows)
		if err != nil {
			continue
		}
		list = append(list, conv)
	}
	return list, nil
}

// SaveConversationRating grava nota de 1 a 5 estrelas e comentário deixado pelo cliente
func (db *DB) SaveConversationRating(convID string, rating int, comment string) error {
	if rating < 1 {
		rating = 1
	}
	if rating > 5 {
		rating = 5
	}
	query := `
	UPDATE conversations
	SET rating = $1, rating_comment = $2, rated_at = NOW(), updated_at = NOW()
	WHERE id = $3;
	`
	_, err := db.Exec(query, rating, strings.TrimSpace(comment), convID)
	return err
}

// SearchConversations busca qualquer atendimento com filtros combinados (operador, setor, grupo RBX, data, termo)
func (db *DB) SearchConversations(filter models.SearchConversationsFilter) ([]*models.Conversation, int, error) {
	whereClauses := []string{"1=1"}
	args := []interface{}{}
	argIdx := 1

	if filter.OperatorID != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("operator_id = $%d", argIdx))
		args = append(args, filter.OperatorID)
		argIdx++
	}
	if filter.Department != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("department = $%d", argIdx))
		args = append(args, filter.Department)
		argIdx++
	}
	if filter.RbxGroup != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("rbx_group = $%d", argIdx))
		args = append(args, filter.RbxGroup)
		argIdx++
	}
	if filter.Status != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, filter.Status)
		argIdx++
	}
	if filter.Rating != nil && *filter.Rating > 0 {
		whereClauses = append(whereClauses, fmt.Sprintf("rating = $%d", argIdx))
		args = append(args, *filter.Rating)
		argIdx++
	}
	if filter.StartDate != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("created_at >= $%d", argIdx))
		args = append(args, *filter.StartDate)
		argIdx++
	}
	if filter.EndDate != nil {
		whereClauses = append(whereClauses, fmt.Sprintf("created_at <= $%d", argIdx))
		args = append(args, *filter.EndDate)
		argIdx++
	}
	if filter.SearchTerm != "" {
		pattern := "%" + strings.ToLower(filter.SearchTerm) + "%"
		whereClauses = append(whereClauses, fmt.Sprintf(
			"(LOWER(client_name) LIKE $%d OR LOWER(contact_name) LIKE $%d OR LOWER(cpf_cnpj) LIKE $%d OR LOWER(id) LIKE $%d OR LOWER(cto) LIKE $%d OR LOWER(olt) LIKE $%d)",
			argIdx, argIdx, argIdx, argIdx, argIdx, argIdx,
		))
		args = append(args, pattern)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM conversations WHERE %s", whereSQL)
	var total int
	if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	dataQuery := fmt.Sprintf(`
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, rbx_group, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at,
	       assigned_at, closed_at, closed_by, close_reason, rating, rating_comment, rated_at,
	       channel, channel_id, channel_meta, bot_step, bot_node_id
	FROM conversations
	WHERE %s
	ORDER BY created_at DESC
	LIMIT $%d OFFSET $%d;
	`, whereSQL, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := db.Query(dataQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := make([]*models.Conversation, 0)
	for rows.Next() {
		conv, err := scanConversationRow(rows)
		if err != nil {
			continue
		}
		list = append(list, conv)
	}

	return list, total, nil
}

// GetReportsSummary calcula indicadores consolidados com TMA, TME e satisfação CSAT
func (db *DB) GetReportsSummary(filter models.ReportMetricsFilter) (*models.ReportSummaryResponse, error) {
	whereClauses := []string{"1=1"}
	args := []interface{}{}
	argIdx := 1

	now := time.Now().UTC()
	var startDate, endDate time.Time

	switch filter.Period {
	case "today":
		startDate = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		endDate = now
	case "7days":
		startDate = now.AddDate(0, 0, -7)
		endDate = now
	case "30days":
		startDate = now.AddDate(0, 0, -30)
		endDate = now
	case "month":
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		endDate = now
	default:
		if filter.StartDate != nil {
			startDate = *filter.StartDate
		}
		if filter.EndDate != nil {
			endDate = *filter.EndDate
		}
	}

	if !startDate.IsZero() {
		whereClauses = append(whereClauses, fmt.Sprintf("created_at >= $%d", argIdx))
		args = append(args, startDate)
		argIdx++
	}
	if !endDate.IsZero() {
		whereClauses = append(whereClauses, fmt.Sprintf("created_at <= $%d", argIdx))
		args = append(args, endDate)
		argIdx++
	}
	if filter.Department != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("department = $%d", argIdx))
		args = append(args, filter.Department)
		argIdx++
	}
	if filter.OperatorID != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("operator_id = $%d", argIdx))
		args = append(args, filter.OperatorID)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	summaryQuery := fmt.Sprintf(`
	SELECT
		COUNT(*),
		COUNT(CASE WHEN status = 'closed' THEN 1 END),
		COUNT(CASE WHEN status = 'active' THEN 1 END),
		COUNT(CASE WHEN status = 'waiting' THEN 1 END),
		COALESCE(AVG(CASE WHEN status = 'closed' AND assigned_at IS NOT NULL AND closed_at IS NOT NULL AND closed_at >= assigned_at THEN EXTRACT(EPOCH FROM (closed_at - assigned_at)) END), 0),
		COALESCE(AVG(CASE WHEN assigned_at IS NOT NULL AND assigned_at >= created_at THEN EXTRACT(EPOCH FROM (assigned_at - created_at)) END), 0),
		COALESCE(AVG(rating), 0),
		COUNT(rating)
	FROM conversations
	WHERE %s;
	`, whereSQL)

	resp := &models.ReportSummaryResponse{
		RatingDistribution: make(map[string]int),
		Departments:        make([]models.DepartmentMetric, 0),
		Operators:          make([]models.OperatorMetric, 0),
		DailyVolume:        make([]models.DailyVolumeMetric, 0),
	}

	err := db.QueryRow(summaryQuery, args...).Scan(
		&resp.TotalTickets,
		&resp.ClosedTickets,
		&resp.ActiveTickets,
		&resp.WaitingTickets,
		&resp.AvgTMASeconds,
		&resp.AvgTMESeconds,
		&resp.AvgRating,
		&resp.TotalRated,
	)
	if err != nil {
		return nil, err
	}

	// Distribuição de notas (1 a 5)
	distQuery := fmt.Sprintf(`
	SELECT rating, COUNT(*)
	FROM conversations
	WHERE %s AND rating IS NOT NULL
	GROUP BY rating;
	`, whereSQL)

	if rows, err := db.Query(distQuery, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var r, count int
			if err := rows.Scan(&r, &count); err == nil {
				resp.RatingDistribution[fmt.Sprintf("%d", r)] = count
			}
		}
	}

	// Métricas por Departamento
	deptQuery := fmt.Sprintf(`
	SELECT
		department,
		COUNT(*),
		COALESCE(AVG(CASE WHEN status = 'closed' AND assigned_at IS NOT NULL AND closed_at IS NOT NULL AND closed_at >= assigned_at THEN EXTRACT(EPOCH FROM (closed_at - assigned_at)) END), 0),
		COALESCE(AVG(CASE WHEN assigned_at IS NOT NULL AND assigned_at >= created_at THEN EXTRACT(EPOCH FROM (assigned_at - created_at)) END), 0),
		COALESCE(AVG(rating), 0),
		COUNT(rating)
	FROM conversations
	WHERE %s AND department != ''
	GROUP BY department
	ORDER BY COUNT(*) DESC;
	`, whereSQL)

	if rows, err := db.Query(deptQuery, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var d models.DepartmentMetric
			if err := rows.Scan(&d.Department, &d.TotalTickets, &d.AvgTMASeconds, &d.AvgTMESeconds, &d.AvgRating, &d.RatedCount); err == nil {
				resp.Departments = append(resp.Departments, d)
			}
		}
	}

	// Métricas por Atendente
	opQuery := fmt.Sprintf(`
	SELECT
		operator_id,
		operator_name,
		department,
		COUNT(*),
		COALESCE(AVG(CASE WHEN status = 'closed' AND assigned_at IS NOT NULL AND closed_at IS NOT NULL AND closed_at >= assigned_at THEN EXTRACT(EPOCH FROM (closed_at - assigned_at)) END), 0),
		COALESCE(AVG(CASE WHEN assigned_at IS NOT NULL AND assigned_at >= created_at THEN EXTRACT(EPOCH FROM (assigned_at - created_at)) END), 0),
		COALESCE(AVG(rating), 0),
		COUNT(rating)
	FROM conversations
	WHERE %s AND operator_id != ''
	GROUP BY operator_id, operator_name, department
	ORDER BY COUNT(*) DESC;
	`, whereSQL)

	if rows, err := db.Query(opQuery, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var o models.OperatorMetric
			if err := rows.Scan(&o.OperatorID, &o.OperatorName, &o.Department, &o.TotalTickets, &o.AvgTMASeconds, &o.AvgTMESeconds, &o.AvgRating, &o.RatedCount); err == nil {
				resp.Operators = append(resp.Operators, o)
			}
		}
	}

	// Volume diário
	dailyQuery := fmt.Sprintf(`
	SELECT
		TO_CHAR(created_at, 'YYYY-MM-DD'),
		COUNT(*),
		COUNT(CASE WHEN status = 'closed' THEN 1 END)
	FROM conversations
	WHERE %s
	GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
	ORDER BY 1 ASC;
	`, whereSQL)

	if rows, err := db.Query(dailyQuery, args...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var day models.DailyVolumeMetric
			if err := rows.Scan(&day.Date, &day.TotalTickets, &day.ClosedTickets); err == nil {
				resp.DailyVolume = append(resp.DailyVolume, day)
			}
		}
	}

	return resp, nil
}

// SaveMessage persiste a mensagem do chat no PostgreSQL
func (db *DB) SaveMessage(msg *models.Message) error {
	if msg == nil || msg.ID == "" || msg.ConversationID == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, msg.Timestamp)
	if err != nil {
		t = time.Now().UTC()
	}
	query := `
	INSERT INTO messages (id, conversation_id, sender_id, sender_type, sender_name, content, timestamp, status)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (id) DO NOTHING;
	`
	_, err = db.Exec(query,
		msg.ID, msg.ConversationID, msg.SenderID, string(msg.SenderType),
		msg.SenderName, msg.Content, t, string(msg.Status),
	)
	return err
}

// GetMessagesByConversation busca mensagens ordenadas do banco de dados
func (db *DB) GetMessagesByConversation(convID string, limit int) ([]*models.Message, error) {
	if limit <= 0 {
		limit = 100
	}
	query := `
	SELECT id, conversation_id, sender_id, sender_type, sender_name, content, timestamp, status
	FROM messages
	WHERE conversation_id = $1
	ORDER BY timestamp ASC
	LIMIT $2;
	`
	rows, err := db.Query(query, convID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	msgs := make([]*models.Message, 0)
	for rows.Next() {
		var msg models.Message
		var sTypeStr, statusStr string
		var t time.Time
		err := rows.Scan(
			&msg.ID, &msg.ConversationID, &msg.SenderID, &sTypeStr,
			&msg.SenderName, &msg.Content, &t, &statusStr,
		)
		if err != nil {
			continue
		}
		msg.SenderType = models.SenderType(sTypeStr)
		msg.Status = models.MessageStatus(statusStr)
		msg.Timestamp = t.Format(time.RFC3339)
		msgs = append(msgs, &msg)
	}
	return msgs, nil
}

// ResetConversationsAndMessages limpa todo o histórico de conversas do banco
func (db *DB) ResetConversationsAndMessages() error {
	_, err := db.Exec("DELETE FROM conversations;")
	return err
}

// GetPhoneVariants retorna todas as variações possíveis de um número brasileiro no WhatsApp
// (com 55, sem 55, com 9º dígito e sem 9º dígito)
func GetPhoneVariants(phone string) []string {
	clean := regexp.MustCompile(`\D`).ReplaceAllString(phone, "")
	if len(clean) < 8 {
		if clean == "" {
			return nil
		}
		return []string{clean}
	}

	variantsMap := make(map[string]bool)
	variantsMap[clean] = true

	// Se tem DDI 55
	if strings.HasPrefix(clean, "55") && len(clean) >= 10 {
		withoutDDI := clean[2:]
		variantsMap[withoutDDI] = true
		if len(withoutDDI) == 10 { // DDD (2) + 8 dígitos (sem 9)
			ddd := withoutDDI[:2]
			num := withoutDDI[2:]
			variantsMap["55"+ddd+"9"+num] = true
			variantsMap[ddd+"9"+num] = true
		} else if len(withoutDDI) == 11 && withoutDDI[2] == '9' { // DDD (2) + 9 + 8 dígitos (com 9)
			ddd := withoutDDI[:2]
			numWithout9 := withoutDDI[3:]
			variantsMap["55"+ddd+numWithout9] = true
			variantsMap[ddd+numWithout9] = true
		}
	} else if len(clean) == 10 { // DDD (2) + 8 dígitos sem DDI
		ddd := clean[:2]
		num := clean[2:]
		variantsMap["55"+clean] = true
		variantsMap["55"+ddd+"9"+num] = true
		variantsMap[ddd+"9"+num] = true
	} else if len(clean) == 11 && clean[2] == '9' { // DDD (2) + 9 + 8 dígitos sem DDI
		ddd := clean[:2]
		numWithout9 := clean[3:]
		variantsMap["55"+clean] = true
		variantsMap["55"+ddd+numWithout9] = true
		variantsMap[ddd+numWithout9] = true
	} else if len(clean) == 8 || len(clean) == 9 {
		variantsMap[clean] = true
	}

	result := make([]string, 0, len(variantsMap))
	for v := range variantsMap {
		result = append(result, v)
	}
	return result
}

// GetActiveConversationByChannel busca uma conversa em andamento ou em espera associada ao canal externo
// suportando variações de telefone brasileiro (com/sem 55, com/sem 9º dígito)
func (db *DB) GetActiveConversationByChannel(channel, channelID string) (*models.Conversation, error) {
	variants := GetPhoneVariants(channelID)
	if len(variants) == 0 {
		variants = []string{channelID}
	}

	isWhatsApp := channel == "whatsapp_evolution" || channel == "whatsapp_official"

	query := `
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, rbx_group, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at,
	       assigned_at, closed_at, closed_by, close_reason, rating, rating_comment, rated_at,
	       channel, channel_id, channel_meta, bot_step, bot_node_id
	FROM conversations
	WHERE (($1 = false AND channel = $2 AND channel_id = $3 AND status != 'closed')
	   OR ($1 = true AND (channel = 'whatsapp_evolution' OR channel = 'whatsapp_official')
	       AND (channel_id = ANY($4) OR REPLACE(client_id, 'wapp-', '') = ANY($4))
	       AND status != 'closed'))
	ORDER BY updated_at DESC
	LIMIT 1;
	`
	row := db.QueryRow(query, isWhatsApp, strings.TrimSpace(channel), strings.TrimSpace(channelID), pq.Array(variants))
	return scanConversationRow(row)
}

// GetChannelsConfig busca as configurações consolidadas de todos os canais de atendimento
func (db *DB) GetChannelsConfig() (*models.ChannelsConfig, error) {
	cfg := &models.ChannelsConfig{
		Telegram: models.TelegramConfig{
			Enabled: false,
			Status:  "disconnected",
		},
		WhatsAppOfficial: models.WhatsAppOfficialConfig{
			Enabled: false,
			Status:  "disconnected",
		},
		WhatsAppEvolution: models.WhatsAppEvolutionConfig{
			Enabled:      true,
			ServerURL:    "http://45.166.31.237:8080",
			ApiKey:       "rr66oi90rr66oi90",
			InstanceName: "solprovedorgroup",
			Status:       "connected",
		},
	}

	rows, err := db.Query("SELECT key, data FROM channel_configs;")
	if err != nil {
		return cfg, nil
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var rawData []byte
		if err := rows.Scan(&key, &rawData); err != nil {
			continue
		}
		switch key {
		case "telegram":
			_ = json.Unmarshal(rawData, &cfg.Telegram)
		case "whatsapp_official":
			_ = json.Unmarshal(rawData, &cfg.WhatsAppOfficial)
		case "whatsapp_evolution":
			_ = json.Unmarshal(rawData, &cfg.WhatsAppEvolution)
		}
	}

	return cfg, nil
}

// SaveChannelConfig persiste a configuração de um canal específico no PostgreSQL
func (db *DB) SaveChannelConfig(key string, data interface{}) error {
	bytes, err := json.Marshal(data)
	if err != nil {
		return err
	}
	query := `
	INSERT INTO channel_configs (key, data, updated_at)
	VALUES ($1, $2, NOW())
	ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
	`
	_, err = db.Exec(query, key, bytes)
	return err
}

// GetAbandonedBotConversations busca atendimentos em status 'bot' que estão inativos há mais tempo que o cutoff
func (db *DB) GetAbandonedBotConversations(cutoff time.Time) ([]*models.Conversation, error) {
	query := `
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, rbx_group, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at,
	       assigned_at, closed_at, closed_by, close_reason, rating, rating_comment, rated_at,
	       channel, channel_id, channel_meta, bot_step, bot_node_id
	FROM conversations
	WHERE status = 'bot' AND updated_at <= $1
	ORDER BY updated_at ASC
	LIMIT 50;
	`
	rows, err := db.Query(query, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*models.Conversation, 0)
	for rows.Next() {
		conv, err := scanConversationRow(rows)
		if err != nil {
			continue
		}
		list = append(list, conv)
	}
	return list, nil
}

// ============================================================================
// SYSTEM SETTINGS & OPERATION MODES (ERP vs NATIVO vs HÍBRIDO)
// ============================================================================

func (db *DB) GetSystemSettings() (*models.SystemSettings, error) {
	query := `
	SELECT operation_mode, setup_completed, company_name, company_cnpj, company_phone, company_email,
	       mercadopago_access_token, mercadopago_public_key, mercadopago_webhook_secret, mercadopago_sandbox, updated_at
	FROM system_settings
	WHERE key = 'global'
	LIMIT 1;
	`
	row := db.QueryRow(query)
	var s models.SystemSettings
	var opMode string
	err := row.Scan(
		&opMode, &s.SetupCompleted, &s.CompanyName, &s.CompanyCNPJ, &s.CompanyPhone, &s.CompanyEmail,
		&s.MercadoPago.AccessToken, &s.MercadoPago.PublicKey, &s.MercadoPago.WebhookSecret, &s.MercadoPago.Sandbox, &s.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		// Padrão inicial caso não haja registro: ERP como padrão para retrocompatibilidade
		return &models.SystemSettings{
			OperationMode:  models.OperationModeERP,
			SetupCompleted: false,
			CompanyName:    "SOL Provedor de Internet",
			MercadoPago: models.MercadoPagoConfig{
				Sandbox: true,
			},
			UpdatedAt: time.Now().UTC(),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	s.OperationMode = models.OperationMode(opMode)
	s.MercadoPago.Configured = s.MercadoPago.AccessToken != ""
	return &s, nil
}

func (db *DB) SaveSystemSettings(s *models.SystemSettings) error {
	query := `
	INSERT INTO system_settings (
		key, operation_mode, setup_completed, company_name, company_cnpj, company_phone, company_email,
		mercadopago_access_token, mercadopago_public_key, mercadopago_webhook_secret, mercadopago_sandbox, updated_at
	) VALUES (
		'global', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
	)
	ON CONFLICT (key) DO UPDATE SET
		operation_mode = EXCLUDED.operation_mode,
		setup_completed = EXCLUDED.setup_completed,
		company_name = EXCLUDED.company_name,
		company_cnpj = EXCLUDED.company_cnpj,
		company_phone = EXCLUDED.company_phone,
		company_email = EXCLUDED.company_email,
		mercadopago_access_token = CASE WHEN EXCLUDED.mercadopago_access_token <> '' THEN EXCLUDED.mercadopago_access_token ELSE system_settings.mercadopago_access_token END,
		mercadopago_public_key = EXCLUDED.mercadopago_public_key,
		mercadopago_webhook_secret = CASE WHEN EXCLUDED.mercadopago_webhook_secret <> '' THEN EXCLUDED.mercadopago_webhook_secret ELSE system_settings.mercadopago_webhook_secret END,
		mercadopago_sandbox = EXCLUDED.mercadopago_sandbox,
		updated_at = NOW();
	`
	_, err := db.Exec(
		query,
		string(s.OperationMode), s.SetupCompleted, s.CompanyName, s.CompanyCNPJ, s.CompanyPhone, s.CompanyEmail,
		s.MercadoPago.AccessToken, s.MercadoPago.PublicKey, s.MercadoPago.WebhookSecret, s.MercadoPago.Sandbox,
	)
	return err
}

// ============================================================================
// NATIVE PLANS (PRODUTOS / SERVIÇOS / PLANOS CONTRATADOS)
// ============================================================================

func (db *DB) ListNativePlans() ([]models.NativePlan, error) {
	query := `
	SELECT id, name, description, price, billing_cycle, speed_download, speed_upload, active, created_at, updated_at
	FROM native_plans
	ORDER BY price ASC, name ASC;
	`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := make([]models.NativePlan, 0)
	for rows.Next() {
		var p models.NativePlan
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.BillingCycle, &p.SpeedDownload, &p.SpeedUpload, &p.Active, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		plans = append(plans, p)
	}
	return plans, nil
}

func (db *DB) GetNativePlan(id string) (*models.NativePlan, error) {
	query := `
	SELECT id, name, description, price, billing_cycle, speed_download, speed_upload, active, created_at, updated_at
	FROM native_plans
	WHERE id = $1;
	`
	var p models.NativePlan
	err := db.QueryRow(query, id).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.BillingCycle, &p.SpeedDownload, &p.SpeedUpload, &p.Active, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (db *DB) CreateNativePlan(p *models.NativePlan) error {
	query := `
	INSERT INTO native_plans (id, name, description, price, billing_cycle, speed_download, speed_upload, active, created_at, updated_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW());
	`
	_, err := db.Exec(query, p.ID, p.Name, p.Description, p.Price, p.BillingCycle, p.SpeedDownload, p.SpeedUpload, p.Active)
	return err
}

func (db *DB) UpdateNativePlan(p *models.NativePlan) error {
	query := `
	UPDATE native_plans
	SET name = $2, description = $3, price = $4, billing_cycle = $5, speed_download = $6, speed_upload = $7, active = $8, updated_at = NOW()
	WHERE id = $1;
	`
	_, err := db.Exec(query, p.ID, p.Name, p.Description, p.Price, p.BillingCycle, p.SpeedDownload, p.SpeedUpload, p.Active)
	return err
}

func (db *DB) DeleteNativePlan(id string) error {
	// Soft delete ou inativação para manter integridade com clientes existentes
	query := `UPDATE native_plans SET active = FALSE, updated_at = NOW() WHERE id = $1;`
	_, err := db.Exec(query, id)
	return err
}

// ============================================================================
// NATIVE CUSTOMERS (CADASTRO PRÓPRIO DE CLIENTES)
// ============================================================================

func (db *DB) ListNativeCustomers(search, status, planId string) ([]models.NativeCustomer, error) {
	query := `
	SELECT c.id, c.name, c.cpf_cnpj, c.email, c.phone, c.address, c.number, c.complement,
	       c.neighborhood, c.city, c.state, c.postal_code, COALESCE(c.plan_id, ''),
	       COALESCE(p.name, 'Sem plano'), c.monthly_price, c.due_day, c.status, c.notes, c.created_at, c.updated_at
	FROM native_customers c
	LEFT JOIN native_plans p ON c.plan_id = p.id
	WHERE 1=1
	`
	args := make([]interface{}, 0)
	argIdx := 1

	if search != "" {
		sClean := "%" + strings.ToLower(strings.TrimSpace(search)) + "%"
		query += fmt.Sprintf(" AND (LOWER(c.name) LIKE $%d OR c.cpf_cnpj LIKE $%d OR LOWER(c.email) LIKE $%d OR c.phone LIKE $%d)", argIdx, argIdx, argIdx, argIdx)
		args = append(args, sClean)
		argIdx++
	}

	if status != "" {
		query += fmt.Sprintf(" AND c.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	if planId != "" {
		query += fmt.Sprintf(" AND c.plan_id = $%d", argIdx)
		args = append(args, planId)
		argIdx++
	}

	query += " ORDER BY c.name ASC LIMIT 300;"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]models.NativeCustomer, 0)
	for rows.Next() {
		var c models.NativeCustomer
		var st string
		if err := rows.Scan(
			&c.ID, &c.Name, &c.CPFCnpj, &c.Email, &c.Phone, &c.Address, &c.Number, &c.Complement,
			&c.Neighborhood, &c.City, &c.State, &c.PostalCode, &c.PlanID,
			&c.PlanName, &c.MonthlyPrice, &c.DueDay, &st, &c.Notes, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			continue
		}
		c.Status = models.NativeCustomerStatus(st)
		list = append(list, c)
	}
	return list, nil
}

func (db *DB) GetNativeCustomer(id string) (*models.NativeCustomer, error) {
	query := `
	SELECT c.id, c.name, c.cpf_cnpj, c.email, c.phone, c.address, c.number, c.complement,
	       c.neighborhood, c.city, c.state, c.postal_code, COALESCE(c.plan_id, ''),
	       COALESCE(p.name, 'Sem plano'), c.monthly_price, c.due_day, c.status, c.notes, c.created_at, c.updated_at
	FROM native_customers c
	LEFT JOIN native_plans p ON c.plan_id = p.id
	WHERE c.id = $1;
	`
	var c models.NativeCustomer
	var st string
	err := db.QueryRow(query, id).Scan(
		&c.ID, &c.Name, &c.CPFCnpj, &c.Email, &c.Phone, &c.Address, &c.Number, &c.Complement,
		&c.Neighborhood, &c.City, &c.State, &c.PostalCode, &c.PlanID,
		&c.PlanName, &c.MonthlyPrice, &c.DueDay, &st, &c.Notes, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	c.Status = models.NativeCustomerStatus(st)
	return &c, nil
}

func (db *DB) GetNativeCustomerByCPF(cpf string) (*models.NativeCustomer, error) {
	clean := regexp.MustCompile(`[^0-9]`).ReplaceAllString(cpf, "")
	query := `
	SELECT c.id, c.name, c.cpf_cnpj, c.email, c.phone, c.address, c.number, c.complement,
	       c.neighborhood, c.city, c.state, c.postal_code, COALESCE(c.plan_id, ''),
	       COALESCE(p.name, 'Sem plano'), c.monthly_price, c.due_day, c.status, c.notes, c.created_at, c.updated_at
	FROM native_customers c
	LEFT JOIN native_plans p ON c.plan_id = p.id
	WHERE regexp_replace(c.cpf_cnpj, '[^0-9]', '', 'g') = $1
	LIMIT 1;
	`
	var c models.NativeCustomer
	var st string
	err := db.QueryRow(query, clean).Scan(
		&c.ID, &c.Name, &c.CPFCnpj, &c.Email, &c.Phone, &c.Address, &c.Number, &c.Complement,
		&c.Neighborhood, &c.City, &c.State, &c.PostalCode, &c.PlanID,
		&c.PlanName, &c.MonthlyPrice, &c.DueDay, &st, &c.Notes, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	c.Status = models.NativeCustomerStatus(st)
	return &c, nil
}

func (db *DB) CreateNativeCustomer(c *models.NativeCustomer) error {
	query := `
	INSERT INTO native_customers (
		id, name, cpf_cnpj, email, phone, address, number, complement,
		neighborhood, city, state, postal_code, plan_id, monthly_price, due_day, status, notes, created_at, updated_at
	) VALUES (
		$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
	);
	`
	var planArg interface{} = c.PlanID
	if c.PlanID == "" {
		planArg = nil
	}
	_, err := db.Exec(
		query,
		c.ID, c.Name, c.CPFCnpj, c.Email, c.Phone, c.Address, c.Number, c.Complement,
		c.Neighborhood, c.City, c.State, c.PostalCode, planArg, c.MonthlyPrice, c.DueDay, string(c.Status), c.Notes,
	)
	return err
}

func (db *DB) UpdateNativeCustomer(c *models.NativeCustomer) error {
	query := `
	UPDATE native_customers
	SET name = $2, cpf_cnpj = $3, email = $4, phone = $5, address = $6, number = $7, complement = $8,
	    neighborhood = $9, city = $10, state = $11, postal_code = $12, plan_id = $13, monthly_price = $14,
	    due_day = $15, status = $16, notes = $17, updated_at = NOW()
	WHERE id = $1;
	`
	var planArg interface{} = c.PlanID
	if c.PlanID == "" {
		planArg = nil
	}
	_, err := db.Exec(
		query,
		c.ID, c.Name, c.CPFCnpj, c.Email, c.Phone, c.Address, c.Number, c.Complement,
		c.Neighborhood, c.City, c.State, c.PostalCode, planArg, c.MonthlyPrice,
		c.DueDay, string(c.Status), c.Notes,
	)
	return err
}

func (db *DB) DeleteNativeCustomer(id string) error {
	query := `DELETE FROM native_customers WHERE id = $1;`
	_, err := db.Exec(query, id)
	return err
}

// ============================================================================
// NATIVE INVOICES (FATURAS E MERCADO PAGO)
// ============================================================================

func (db *DB) ListNativeInvoices(customerID, cpf, status string) ([]models.NativeInvoice, error) {
	query := `
	SELECT i.id, i.customer_id, COALESCE(c.name, 'Cliente'), i.cpf_cnpj, i.amount, TO_CHAR(i.due_date, 'YYYY-MM-DD'),
	       i.status, i.description, i.payment_method, i.mp_payment_id, i.pix_qr_code, i.pix_qr_code_base64,
	       i.boleto_url, i.boleto_barcode, i.paid_at, i.created_at, i.updated_at
	FROM native_invoices i
	LEFT JOIN native_customers c ON i.customer_id = c.id
	WHERE 1=1
	`
	args := make([]interface{}, 0)
	argIdx := 1

	if customerID != "" {
		query += fmt.Sprintf(" AND i.customer_id = $%d", argIdx)
		args = append(args, customerID)
		argIdx++
	}

	if cpf != "" {
		clean := regexp.MustCompile(`[^0-9]`).ReplaceAllString(cpf, "")
		query += fmt.Sprintf(" AND regexp_replace(i.cpf_cnpj, '[^0-9]', '', 'g') = $%d", argIdx)
		args = append(args, clean)
		argIdx++
	}

	if status != "" {
		query += fmt.Sprintf(" AND i.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	query += " ORDER BY i.due_date DESC LIMIT 200;"

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]models.NativeInvoice, 0)
	for rows.Next() {
		var inv models.NativeInvoice
		var st string
		var paidAt sql.NullTime
		if err := rows.Scan(
			&inv.ID, &inv.CustomerID, &inv.CustomerName, &inv.CPFCnpj, &inv.Amount, &inv.DueDate,
			&st, &inv.Description, &inv.PaymentMethod, &inv.MPPaymentID, &inv.PixQRCode, &inv.PixQRCodeBase64,
			&inv.BoletoURL, &inv.BoletoBarcode, &paidAt, &inv.CreatedAt, &inv.UpdatedAt,
		); err != nil {
			continue
		}
		inv.Status = models.InvoiceStatus(st)
		if paidAt.Valid {
			inv.PaidAt = &paidAt.Time
		}
		list = append(list, inv)
	}
	return list, nil
}

func (db *DB) GetNativeInvoice(id string) (*models.NativeInvoice, error) {
	query := `
	SELECT i.id, i.customer_id, COALESCE(c.name, 'Cliente'), i.cpf_cnpj, i.amount, TO_CHAR(i.due_date, 'YYYY-MM-DD'),
	       i.status, i.description, i.payment_method, i.mp_payment_id, i.pix_qr_code, i.pix_qr_code_base64,
	       i.boleto_url, i.boleto_barcode, i.paid_at, i.created_at, i.updated_at
	FROM native_invoices i
	LEFT JOIN native_customers c ON i.customer_id = c.id
	WHERE i.id = $1;
	`
	var inv models.NativeInvoice
	var st string
	var paidAt sql.NullTime
	err := db.QueryRow(query, id).Scan(
		&inv.ID, &inv.CustomerID, &inv.CustomerName, &inv.CPFCnpj, &inv.Amount, &inv.DueDate,
		&st, &inv.Description, &inv.PaymentMethod, &inv.MPPaymentID, &inv.PixQRCode, &inv.PixQRCodeBase64,
		&inv.BoletoURL, &inv.BoletoBarcode, &paidAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	inv.Status = models.InvoiceStatus(st)
	if paidAt.Valid {
		inv.PaidAt = &paidAt.Time
	}
	return &inv, nil
}

func (db *DB) GetNativeInvoiceByMPPaymentID(mpID string) (*models.NativeInvoice, error) {
	query := `
	SELECT i.id, i.customer_id, COALESCE(c.name, 'Cliente'), i.cpf_cnpj, i.amount, TO_CHAR(i.due_date, 'YYYY-MM-DD'),
	       i.status, i.description, i.payment_method, i.mp_payment_id, i.pix_qr_code, i.pix_qr_code_base64,
	       i.boleto_url, i.boleto_barcode, i.paid_at, i.created_at, i.updated_at
	FROM native_invoices i
	LEFT JOIN native_customers c ON i.customer_id = c.id
	WHERE i.mp_payment_id = $1;
	`
	var inv models.NativeInvoice
	var st string
	var paidAt sql.NullTime
	err := db.QueryRow(query, mpID).Scan(
		&inv.ID, &inv.CustomerID, &inv.CustomerName, &inv.CPFCnpj, &inv.Amount, &inv.DueDate,
		&st, &inv.Description, &inv.PaymentMethod, &inv.MPPaymentID, &inv.PixQRCode, &inv.PixQRCodeBase64,
		&inv.BoletoURL, &inv.BoletoBarcode, &paidAt, &inv.CreatedAt, &inv.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	inv.Status = models.InvoiceStatus(st)
	if paidAt.Valid {
		inv.PaidAt = &paidAt.Time
	}
	return &inv, nil
}

func (db *DB) CreateNativeInvoice(inv *models.NativeInvoice) error {
	query := `
	INSERT INTO native_invoices (
		id, customer_id, cpf_cnpj, amount, due_date, status, description,
		payment_method, mp_payment_id, pix_qr_code, pix_qr_code_base64, boleto_url, boleto_barcode, created_at, updated_at
	) VALUES (
		$1, $2, $3, $4, $5::DATE, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
	);
	`
	_, err := db.Exec(
		query,
		inv.ID, inv.CustomerID, inv.CPFCnpj, inv.Amount, inv.DueDate, string(inv.Status), inv.Description,
		inv.PaymentMethod, inv.MPPaymentID, inv.PixQRCode, inv.PixQRCodeBase64, inv.BoletoURL, inv.BoletoBarcode,
	)
	return err
}

func (db *DB) UpdateNativeInvoice(inv *models.NativeInvoice) error {
	query := `
	UPDATE native_invoices
	SET amount = $2, due_date = $3::DATE, status = $4, description = $5, payment_method = $6,
	    mp_payment_id = $7, pix_qr_code = $8, pix_qr_code_base64 = $9, boleto_url = $10,
	    boleto_barcode = $11, paid_at = $12, updated_at = NOW()
	WHERE id = $1;
	`
	var paidAtArg interface{} = nil
	if inv.PaidAt != nil {
		paidAtArg = *inv.PaidAt
	}
	_, err := db.Exec(
		query,
		inv.ID, inv.Amount, inv.DueDate, string(inv.Status), inv.Description, inv.PaymentMethod,
		inv.MPPaymentID, inv.PixQRCode, inv.PixQRCodeBase64, inv.BoletoURL, inv.BoletoBarcode, paidAtArg,
	)
	return err
}

func (db *DB) MarkInvoiceAsPaid(id, mpPaymentID string, paidAt time.Time) error {
	query := `
	UPDATE native_invoices
	SET status = 'paid', mp_payment_id = CASE WHEN $2 <> '' THEN $2 ELSE mp_payment_id END, paid_at = $3, updated_at = NOW()
	WHERE id = $1;
	`
	_, err := db.Exec(query, id, mpPaymentID, paidAt)
	return err
}

func (db *DB) seedDefaultLicense() error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM system_license").Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		now := time.Now().UTC()
		expires := now.Add(30 * 24 * time.Hour)
		grace := expires.Add(72 * time.Hour)

		query := `
		INSERT INTO system_license (
			id, license_key, tenant_cnpj, tenant_name, license_type, status, trial_days_remaining,
			expires_at, grace_period_until, max_operators, allowed_modules, updated_at
		) VALUES (
			1, 'TRIAL-30DAYS-INITIAL', '', 'Empresa em Avaliação', 'trial', 'trial', 30,
			$1, $2, 10, 'erp,native,omnichannel', NOW()
		);
		`
		_, err := db.Exec(query, expires, grace)
		return err
	}
	return nil
}

func (db *DB) GetSystemLicense() (*models.SystemLicense, error) {
	query := `
	SELECT license_key, tenant_cnpj, tenant_name, license_type, status,
	       trial_days_remaining, expires_at, grace_period_until, last_heartbeat_at,
	       max_operators, allowed_modules, COALESCE(allowed_operation_mode, 'hybrid'), suspension_reason, payment_pix,
	       payment_qr_code_base64, payment_amount, discount_description, discount_amount,
	       contact_support_phone, contact_support_email, signature, updated_at
	FROM system_license
	WHERE id = 1;
	`
	var lic models.SystemLicense
	var licType, st string
	var lastHeartbeat sql.NullTime

	err := db.QueryRow(query).Scan(
		&lic.LicenseKey, &lic.TenantCNPJ, &lic.TenantName, &licType, &st,
		&lic.TrialDaysRemaining, &lic.ExpiresAt, &lic.GracePeriodUntil, &lastHeartbeat,
		&lic.MaxOperators, &lic.AllowedModules, &lic.AllowedOperationMode, &lic.SuspensionReason, &lic.PaymentPix,
		&lic.PaymentQRCodeBase64, &lic.PaymentAmount, &lic.DiscountDescription, &lic.DiscountAmount,
		&lic.ContactSupportPhone, &lic.ContactSupportEmail, &lic.Signature, &lic.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			_ = db.seedDefaultLicense()
			return db.GetSystemLicense()
		}
		return nil, err
	}

	lic.LicenseType = models.LicenseType(licType)
	lic.Status = models.LicenseStatus(st)
	if lastHeartbeat.Valid {
		lic.LastHeartbeatAt = lastHeartbeat.Time
	}
	if lic.AllowedOperationMode == "" {
		lic.AllowedOperationMode = "hybrid"
	}

	// Atualiza dinamicamente a contagem de dias restantes se for trial
	if lic.LicenseType == models.LicenseTypeTrial && lic.Status == models.LicenseStatusTrial {
		diff := time.Until(lic.ExpiresAt)
		days := int(diff.Hours() / 24)
		if days < 0 {
			days = 0
		}
		lic.TrialDaysRemaining = days
		if diff <= 0 {
			lic.Status = models.LicenseStatusSuspended
			lic.SuspensionReason = "Período de avaliação gratuita de 30 dias expirado. Ative sua licença ou contrate seu plano."
		}
	}

	return &lic, nil
}

func (db *DB) SaveSystemLicense(lic *models.SystemLicense) error {
	query := `
	INSERT INTO system_license (
		id, license_key, tenant_cnpj, tenant_name, license_type, status,
		trial_days_remaining, expires_at, grace_period_until, last_heartbeat_at,
		max_operators, allowed_modules, allowed_operation_mode, suspension_reason, payment_pix,
		payment_qr_code_base64, payment_amount, discount_description, discount_amount,
		contact_support_phone, contact_support_email, signature, updated_at
	) VALUES (
		1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW()
	)
	ON CONFLICT (id) DO UPDATE SET
		license_key = EXCLUDED.license_key,
		tenant_cnpj = EXCLUDED.tenant_cnpj,
		tenant_name = EXCLUDED.tenant_name,
		license_type = EXCLUDED.license_type,
		status = EXCLUDED.status,
		trial_days_remaining = EXCLUDED.trial_days_remaining,
		expires_at = EXCLUDED.expires_at,
		grace_period_until = EXCLUDED.grace_period_until,
		last_heartbeat_at = EXCLUDED.last_heartbeat_at,
		max_operators = EXCLUDED.max_operators,
		allowed_modules = EXCLUDED.allowed_modules,
		allowed_operation_mode = EXCLUDED.allowed_operation_mode,
		suspension_reason = EXCLUDED.suspension_reason,
		payment_pix = EXCLUDED.payment_pix,
		payment_qr_code_base64 = EXCLUDED.payment_qr_code_base64,
		payment_amount = EXCLUDED.payment_amount,
		discount_description = EXCLUDED.discount_description,
		discount_amount = EXCLUDED.discount_amount,
		contact_support_phone = EXCLUDED.contact_support_phone,
		contact_support_email = EXCLUDED.contact_support_email,
		signature = EXCLUDED.signature,
		updated_at = NOW();
	`
	var lastHbArg interface{} = nil
	if !lic.LastHeartbeatAt.IsZero() {
		lastHbArg = lic.LastHeartbeatAt
	}

	allowedOp := lic.AllowedOperationMode
	if allowedOp == "" {
		allowedOp = "hybrid"
	}

	_, err := db.Exec(
		query,
		lic.LicenseKey, lic.TenantCNPJ, lic.TenantName, string(lic.LicenseType), string(lic.Status),
		lic.TrialDaysRemaining, lic.ExpiresAt, lic.GracePeriodUntil, lastHbArg,
		lic.MaxOperators, lic.AllowedModules, allowedOp, lic.SuspensionReason, lic.PaymentPix,
		lic.PaymentQRCodeBase64, lic.PaymentAmount, lic.DiscountDescription, lic.DiscountAmount,
		lic.ContactSupportPhone, lic.ContactSupportEmail, lic.Signature,
	)
	return err
}








