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
	`

	if _, err := db.Exec(query); err != nil {
		return err
	}

	// Semeia configurações padrões (mensagem de encerramento e fluxo visual)
	if err := db.seedDefaultSettings(); err != nil {
		return err
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


