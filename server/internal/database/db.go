package database

import (
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"

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
	`

	if _, err := db.Exec(query); err != nil {
		return err
	}

	// Semeia configurações padrões (mensagem de encerramento e fluxo visual)
	if err := db.seedDefaultSettings(); err != nil {
		return err
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
	SELECT id, name, email, role, department, password_hash, active, phone, created_at, last_login
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
	SELECT id, name, email, role, department, password_hash, active, phone, created_at, last_login
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
	SELECT id, name, email, role, department, active, phone, created_at, last_login
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
	RETURNING id, name, email, role, department, active, phone, created_at, last_login
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
	RETURNING id, name, email, role, department, active, phone, created_at, last_login
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
	query := `
	INSERT INTO conversations (
		id, client_id, client_name, contact_name, cpf_cnpj, department, status,
		operator_id, operator_name, olt, pon, cto, created_at, updated_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	ON CONFLICT (id) DO UPDATE SET
		client_name = EXCLUDED.client_name,
		contact_name = EXCLUDED.contact_name,
		cpf_cnpj = CASE WHEN EXCLUDED.cpf_cnpj != '' THEN EXCLUDED.cpf_cnpj ELSE conversations.cpf_cnpj END,
		department = EXCLUDED.department,
		status = EXCLUDED.status,
		operator_id = EXCLUDED.operator_id,
		operator_name = EXCLUDED.operator_name,
		olt = CASE WHEN EXCLUDED.olt != '' THEN EXCLUDED.olt ELSE conversations.olt END,
		pon = CASE WHEN EXCLUDED.pon != '' THEN EXCLUDED.pon ELSE conversations.pon END,
		cto = CASE WHEN EXCLUDED.cto != '' THEN EXCLUDED.cto ELSE conversations.cto END,
		updated_at = EXCLUDED.updated_at;
	`
	_, err := db.Exec(query,
		conv.ID, conv.ClientID, conv.ClientName, conv.ContactName, conv.CpfCnpj,
		conv.Department, string(conv.Status), opID, opName,
		conv.OLT, conv.PON, conv.CTO, conv.CreatedAt, conv.UpdatedAt,
	)
	return err
}

// GetConversationByID busca uma conversa específica no banco
func (db *DB) GetConversationByID(id string) (*models.Conversation, error) {
	query := `
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at
	FROM conversations WHERE id = $1;
	`
	var conv models.Conversation
	var opID, opName, statusStr string
	err := db.QueryRow(query, id).Scan(
		&conv.ID, &conv.ClientID, &conv.ClientName, &conv.ContactName, &conv.CpfCnpj,
		&conv.Department, &statusStr, &opID, &opName, &conv.OLT, &conv.PON, &conv.CTO,
		&conv.CreatedAt, &conv.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	conv.Status = models.ConversationStatus(statusStr)
	if opID != "" || opName != "" {
		conv.Operator = &models.OperatorInfo{
			ID:   opID,
			Name: opName,
		}
	}
	return &conv, nil
}

// ListConversations retorna todas as conversas do banco, com filtros opcionais de status e CPF/CNPJ
func (db *DB) ListConversations(status models.ConversationStatus, cpfCnpj string) ([]*models.Conversation, error) {
	query := `
	SELECT id, client_id, client_name, contact_name, cpf_cnpj, department, status,
	       operator_id, operator_name, olt, pon, cto, created_at, updated_at
	FROM conversations
	WHERE ($1 = '' OR status = $1)
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
		var conv models.Conversation
		var opID, opName, statusStr string
		err := rows.Scan(
			&conv.ID, &conv.ClientID, &conv.ClientName, &conv.ContactName, &conv.CpfCnpj,
			&conv.Department, &statusStr, &opID, &opName, &conv.OLT, &conv.PON, &conv.CTO,
			&conv.CreatedAt, &conv.UpdatedAt,
		)
		if err != nil {
			continue
		}
		conv.Status = models.ConversationStatus(statusStr)
		if opID != "" || opName != "" {
			conv.Operator = &models.OperatorInfo{
				ID:   opID,
				Name: opName,
			}
		}
		list = append(list, &conv)
	}
	return list, nil
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




