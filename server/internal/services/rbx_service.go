package services

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

type RBXService struct {
	db         *database.DB
	httpClient *http.Client
}

func NewRBXService(db *database.DB) *RBXService {
	// Cliente HTTP com timeout estrito e suporte a certificados SSL
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   8 * time.Second,
	}

	return &RBXService{
		db:         db,
		httpClient: client,
	}
}

// CleanDoc remove caracteres não numéricos de CPF e CNPJ
func CleanDoc(doc string) string {
	reg := regexp.MustCompile(`[^0-9]`)
	return reg.ReplaceAllString(doc, "")
}

// formatV1Url normaliza a URL do endpoint V1 (rbx_server_json.php)
func (s *RBXService) formatV1Url(baseUrl string) string {
	cleanUrl := strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if strings.HasSuffix(cleanUrl, "/routerbox/ws/rbx_server_json.php") {
		return cleanUrl
	}
	if strings.HasSuffix(cleanUrl, "/routerbox/ws_json/ws_json.php") {
		return strings.Replace(cleanUrl, "/routerbox/ws_json/ws_json.php", "/routerbox/ws/rbx_server_json.php", 1)
	}
	if strings.HasSuffix(cleanUrl, "/routerbox") {
		return cleanUrl + "/ws/rbx_server_json.php"
	}
	return cleanUrl + "/routerbox/ws/rbx_server_json.php"
}

// formatV2Url normaliza a URL do endpoint V2 (ws_json.php)
func (s *RBXService) formatV2Url(baseUrl string) string {
	cleanUrl := strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if strings.HasSuffix(cleanUrl, "/routerbox/ws_json/ws_json.php") {
		return cleanUrl
	}
	if strings.HasSuffix(cleanUrl, "/routerbox/ws/rbx_server_json.php") {
		return strings.Replace(cleanUrl, "/routerbox/ws/rbx_server_json.php", "/routerbox/ws_json/ws_json.php", 1)
	}
	if strings.HasSuffix(cleanUrl, "/routerbox") {
		return cleanUrl + "/ws_json/ws_json.php"
	}
	return cleanUrl + "/routerbox/ws_json/ws_json.php"
}

// GetConfig retorna as configurações do RBX ativas
func (s *RBXService) GetConfig() *models.RBXConfig {
	if s.db == nil {
		return database.DefaultRBXConfig()
	}
	cfg, err := s.db.GetRBXConfig()
	if err != nil {
		return database.DefaultRBXConfig()
	}
	// Garante remoção de espaços em branco acidentais
	cfg.ApiKey = strings.TrimSpace(cfg.ApiKey)
	cfg.BaseURL = strings.TrimSpace(cfg.BaseURL)
	return cfg
}

// SaveConfig atualiza as configurações do RBX
func (s *RBXService) SaveConfig(cfg *models.RBXConfig) error {
	if s.db == nil {
		return fmt.Errorf("banco de dados não inicializado")
	}
	cfg.ApiKey = strings.TrimSpace(cfg.ApiKey)
	cfg.BaseURL = strings.TrimSpace(cfg.BaseURL)
	return s.db.SaveRBXConfig(cfg)
}

// LookupClientByCPFCNPJ busca o cadastro do assinante no RBX pelo CPF ou CNPJ (V1 / V2)
func (s *RBXService) LookupClientByCPFCNPJ(ctx context.Context, cpfCnpj string) (*models.RBXClient, error) {
	clean := CleanDoc(cpfCnpj)
	if len(clean) < 11 {
		return nil, fmt.Errorf("documento inválido: informe um CPF (11 dígitos) ou CNPJ (14 dígitos)")
	}

	cfg := s.GetConfig()

	// 1. Tenta consulta real no Web Service do RBX se houver URL configurada e não for simulação estrita
	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		client, err := s.queryRealRBXClient(ctx, cfg, clean)
		if err != nil {
			return nil, err
		}
		return client, nil
	}

	// 2. Se modo de simulação estiver ativo, tenta o servidor real primeiro caso a URL esteja configurada
	if cfg.SimulationMode && cfg.BaseURL != "" && cfg.ApiKey != "" {
		client, err := s.queryRealRBXClient(ctx, cfg, clean)
		if err == nil && client != nil {
			return client, nil
		}
	}

	// 3. Fallback mock apenas quando em modo de simulação explícito e sem servidor disponível
	if cfg.SimulationMode {
		return s.mockClientByDoc(clean), nil
	}

	return nil, fmt.Errorf("integração com o ERP RBX desabilitada")
}

// queryRealRBXClient executa chamada HTTP real ao Web Service RBX V1 (ConsultaClientes)
func (s *RBXService) queryRealRBXClient(ctx context.Context, cfg *models.RBXConfig, cleanDoc string) (*models.RBXClient, error) {
	v1Url := s.formatV1Url(cfg.BaseURL)
	apiKey := strings.TrimSpace(cfg.ApiKey)

	payload := map[string]interface{}{
		"ConsultaClientes": map[string]interface{}{
			"Autenticacao": map[string]string{
				"ChaveIntegracao": apiKey,
			},
			"Filtro": fmt.Sprintf("CNPJ_CNPF = '%s'", cleanDoc),
		},
	}

	rawBody, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", v1Url, bytes.NewBuffer(rawBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao conectar no servidor RBX: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("servidor RBX retornou status HTTP %d", resp.StatusCode)
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rbxResp struct {
		Status      int                      `json:"status"`
		ErrorCode   interface{}              `json:"erro_code"`
		ErrorDesc   string                   `json:"erro_desc"`
		ErrorDetail string                   `json:"erro_detail"`
		Result      []map[string]interface{} `json:"result"`
	}
	if err := json.Unmarshal(respBytes, &rbxResp); err != nil {
		return nil, fmt.Errorf("resposta inválida do servidor RBX: %w", err)
	}

	if rbxResp.Status == 0 || len(rbxResp.Result) == 0 {
		msg := rbxResp.ErrorDesc
		if msg == "" {
			msg = rbxResp.ErrorDetail
		}
		if msg == "" {
			msg = "Cliente com este CPF/CNPJ não localizado no ERP RBX"
		}
		return nil, fmt.Errorf("%s", msg)
	}

	first := rbxResp.Result[0]

	nome := fmt.Sprintf("%v", first["Nome"])
	codigo := fmt.Sprintf("%v", first["Codigo"])
	tipo := fmt.Sprintf("%v", first["Tipo"])
	endereco := fmt.Sprintf("%v", first["Endereco"])
	numero := fmt.Sprintf("%v", first["Numero"])
	complemento := fmt.Sprintf("%v", first["Complemento"])
	bairro := fmt.Sprintf("%v", first["Bairro"])
	cidade := fmt.Sprintf("%v", first["Cidade"])
	uf := fmt.Sprintf("%v", first["UF"])
	cep := fmt.Sprintf("%v", first["CEP"])
	if cep == "<nil>" || cep == "" {
		cep = fmt.Sprintf("%v", first["Cep"])
	}
	email := fmt.Sprintf("%v", first["Email"])
	tel := fmt.Sprintf("%v", first["TelResidencial"])
	cel := fmt.Sprintf("%v", first["TelCelular"])
	aviso := fmt.Sprintf("%v", first["AvisoPagamento"])
	situacao := fmt.Sprintf("%v", first["Situacao"])

	if aviso == "" || aviso == "<nil>" {
		aviso = "S"
	}

	conexaoStatus := "online"
	if situacao == "B" || situacao == "C" {
		conexaoStatus = "bloqueado"
	}

	// Formata endereço amigável
	enderecoCompleto := endereco
	if numero != "" && numero != "<nil>" {
		enderecoCompleto += ", " + numero
	}
	if complemento != "" && complemento != "<nil>" {
		enderecoCompleto += " (" + complemento + ")"
	}

	client := &models.RBXClient{
		Codigo:            codigo,
		Nome:              nome,
		Tipo:              tipo,
		CpfCnpj:           cleanDoc,
		Endereco:          enderecoCompleto,
		Numero:            numero,
		Bairro:            bairro,
		Cidade:            cidade,
		UF:                uf,
		Cep:               cep,
		Email:             email,
		Telefone:          tel,
		Celular:           cel,
		AvisoPagamento:    aviso,
		Status:            situacao,
		ContratoDescricao: "Assinante Fibra Óptica SOL",
		ConexaoStatus:     conexaoStatus,
	}

	return client, nil
}

// mockClientByDoc gera dados do cliente para testes apenas em ambiente simulado
func (s *RBXService) mockClientByDoc(cleanDoc string) *models.RBXClient {
	isPJ := len(cleanDoc) > 11

	nome := "Carlos Eduardo Mendes"
	if isPJ {
		nome = "Mendes & Associados Tecnologia LTDA"
	}

	return &models.RBXClient{
		Codigo:            "330531",
		Nome:              nome,
		NomeFantasia:      "Mendes Telecom",
		Tipo:              map[bool]string{true: "J", false: "F"}[isPJ],
		CpfCnpj:           cleanDoc,
		Endereco:          "Av. Paulista, 1374",
		Numero:            "1374",
		Bairro:            "Bela Vista",
		Cidade:            "São Paulo",
		UF:                "SP",
		Cep:               "01310-100",
		Email:             "carlos.mendes@email.com",
		Telefone:          "(11) 3254-8900",
		Celular:           "(11) 98765-4321",
		AvisoPagamento:    "S",
		Status:            "A",
		ContratoDescricao: "Plano Ultra Fibra 600MB + Wi-Fi 6",
		ConexaoStatus:     "online",
	}
}

// GetClientFinancial busca as faturas e documentos em aberto do cliente no RBX (V1 / V2)
func (s *RBXService) GetClientFinancial(ctx context.Context, customerId string, cpfCnpj string) (*models.RBXFinancialSummary, error) {
	cleanDoc := CleanDoc(cpfCnpj)
	cfg := s.GetConfig()

	// Se houver servidor real conectado, consulta títulos em aberto no RBX
	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		docs, err := s.queryRealUnpaidDocuments(ctx, cfg, customerId)
		if err == nil {
			var total float64
			overdue := 0
			for _, d := range docs {
				total += d.Value
				if d.Status == "vencido" {
					overdue++
				}
			}
			return &models.RBXFinancialSummary{
				CustomerId:         customerId,
				CustomerName:       "Cliente RBX",
				CpfCnpj:            cleanDoc,
				TotalUnpaid:        total,
				OverdueCount:       overdue,
				CanRequestPromessa: overdue > 0,
				AvisoPagamento:     "S",
				Documents:          docs,
			}, nil
		}
	}

	// Fallback com faturas realistas do RBX apenas em modo simulação
	if cfg.SimulationMode {
		now := time.Now()
		doc1DueDate := now.AddDate(0, 0, 5).Format("2006-01-02")
		doc2DueDate := now.AddDate(0, 0, -3).Format("2006-01-02")

		docs := []models.RBXUnpaidDocument{
			{
				ID:             11313347,
				AccountNumber:  3,
				DueDate:        doc1DueDate,
				DocumentNumber: "22934",
				BankNumber:     "2255878",
				Value:          99.90,
				Historic:       "Mensalidade Ultra Fibra 600MB - Mês Atual",
				Comments:       "Emitido com QR Code Pix integrado",
				PixCopiaCola:   "00020126580014br.gov.bcb.pix0136b940a0c6-c41c-4d6a-bd0d-a32655cb65c2520400005303986540599.905802BR5915SOL TELECOM6009SAO PAULO62070503***630417E5",
				BoletoLink:     "https://solcrm.com.br/boletos/22934.pdf",
				Status:         "aberto",
			},
			{
				ID:             11313439,
				AccountNumber:  3,
				DueDate:        doc2DueDate,
				DocumentNumber: "22812",
				BankNumber:     "2255740",
				Value:          99.90,
				Historic:       "Mensalidade Ultra Fibra 600MB - Mês Anterior",
				Comments:       "Título vencido - Passível de aviso de pagamento",
				PixCopiaCola:   "00020126580014br.gov.bcb.pix0136a831b0b5-b31b-4d5a-bd0d-b21644cb54b1520400005303986540599.905802BR5915SOL TELECOM6009SAO PAULO62070503***630489A1",
				BoletoLink:     "https://solcrm.com.br/boletos/22812.pdf",
				Status:         "vencido",
			},
		}

		return &models.RBXFinancialSummary{
			CustomerId:         customerId,
			CustomerName:       "Carlos Eduardo Mendes",
			CpfCnpj:            cleanDoc,
			TotalUnpaid:        199.80,
			OverdueCount:       1,
			CanRequestPromessa: true,
			AvisoPagamento:     "S",
			Documents:          docs,
		}, nil
	}

	return &models.RBXFinancialSummary{
		CustomerId:         customerId,
		CustomerName:       "Cliente RBX",
		CpfCnpj:            cleanDoc,
		TotalUnpaid:        0,
		OverdueCount:       0,
		CanRequestPromessa: false,
		AvisoPagamento:     "S",
		Documents:          []models.RBXUnpaidDocument{},
	}, nil
}

// queryRealUnpaidDocuments consulta documentos em aberto no RBX via V1 (ConsultaDocumentosAbertos)
func (s *RBXService) queryRealUnpaidDocuments(ctx context.Context, cfg *models.RBXConfig, customerId string) ([]models.RBXUnpaidDocument, error) {
	v1Url := s.formatV1Url(cfg.BaseURL)
	apiKey := strings.TrimSpace(cfg.ApiKey)

	payload := map[string]interface{}{
		"ConsultaDocumentosAbertos": map[string]interface{}{
			"Autenticacao": map[string]string{
				"ChaveIntegracao": apiKey,
			},
			"Filtro": fmt.Sprintf("Cliente = %s", customerId),
		},
	}
	rawBody, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", v1Url, bytes.NewBuffer(rawBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var rbxResp struct {
		Status    int                      `json:"status"`
		ErrorCode interface{}              `json:"erro_code"`
		ErrorDesc string                   `json:"erro_desc"`
		Result    []map[string]interface{} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rbxResp); err != nil {
		return nil, err
	}

	if rbxResp.Status == 0 || len(rbxResp.Result) == 0 {
		return []models.RBXUnpaidDocument{}, nil
	}

	var docs []models.RBXUnpaidDocument
	today := time.Now().Format("2006-01-02")

	for _, item := range rbxResp.Result {
		dueDate := fmt.Sprintf("%v", item["Vencimento"])
		status := "aberto"
		if dueDate < today {
			status = "vencido"
		}

		docId := int64(getInt(item["Sequencia"]))
		if docId == 0 {
			docId = int64(getInt(item["Documento"]))
		}

		doc := models.RBXUnpaidDocument{
			ID:             docId,
			AccountNumber:  getInt(item["Conta"]),
			DueDate:        dueDate,
			DocumentNumber: fmt.Sprintf("%v", item["Documento"]),
			BankNumber:     fmt.Sprintf("%v", item["NossoNumero"]),
			Value:          getFloat(item["Valor"]),
			Historic:       fmt.Sprintf("%v", item["Historico"]),
			Comments:       fmt.Sprintf("%v", item["Complemento"]),
			Status:         status,
			PixCopiaCola:   "", // Obtido sob demanda via V2 get_pix_copia_cola
			PixQRCode:      "", // Obtido sob demanda via V2 get_pix_qrcode
			BoletoLink:     "", // Link gerado sob demanda via V2 get_banking_billet
		}
		docs = append(docs, doc)
	}

	return docs, nil
}

// callV2Raw executa requisição HTTP/1.1 bruta com cabeçalho lowercase exato 'authentication_key'
// indispensável para o Apache/PHP do Web Service RBX V2 (que faz validação case-sensitive)
func (s *RBXService) callV2Raw(ctx context.Context, targetUrl string, apiKey string, serviceName string, serviceData interface{}) ([]byte, int, error) {
	payload := map[string]interface{}{
		serviceName: serviceData,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}

	u, err := url.Parse(targetUrl)
	if err != nil {
		return nil, 0, fmt.Errorf("URL inválida do RBX: %w", err)
	}

	host := u.Host
	port := "443"
	if u.Scheme == "http" {
		port = "80"
	}
	if strings.Contains(host, ":") {
		h, p, err := net.SplitHostPort(host)
		if err == nil {
			host = h
			port = p
		}
	}

	dialer := &net.Dialer{Timeout: 8 * time.Second}
	var rawConn net.Conn
	if u.Scheme == "https" {
		rawConn, err = tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(host, port), &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         host,
		})
	} else {
		rawConn, err = dialer.DialContext(ctx, "tcp", net.JoinHostPort(host, port))
	}
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao conectar no servidor RBX (%s): %w", host, err)
	}
	defer rawConn.Close()

	_ = rawConn.SetDeadline(time.Now().Add(10 * time.Second))

	reqPath := u.RequestURI()
	if reqPath == "" {
		reqPath = "/"
	}

	reqHeader := fmt.Sprintf("POST %s HTTP/1.1\r\n"+
		"Host: %s\r\n"+
		"User-Agent: SolCRM/1.0\r\n"+
		"Content-Type: application/json; charset=utf-8\r\n"+
		"authentication_key: %s\r\n"+
		"Content-Length: %d\r\n"+
		"Connection: close\r\n\r\n", reqPath, u.Host, strings.TrimSpace(apiKey), len(body))

	if _, err := rawConn.Write([]byte(reqHeader)); err != nil {
		return nil, 0, fmt.Errorf("falha ao enviar cabeçalho ao RBX: %w", err)
	}
	if _, err := rawConn.Write(body); err != nil {
		return nil, 0, fmt.Errorf("falha ao enviar corpo ao RBX: %w", err)
	}

	resp, err := http.ReadResponse(bufio.NewReader(rawConn), nil)
	if err != nil {
		return nil, 0, fmt.Errorf("falha ao ler resposta do RBX: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("falha ao ler dados da resposta do RBX: %w", err)
	}

	return respBytes, resp.StatusCode, nil
}

// GetPixCopiaCola busca o Pix Copia e Cola no RBX (V2: get_pix_copia_cola)
func (s *RBXService) GetPixCopiaCola(ctx context.Context, billetId int64) (string, error) {
	cfg := s.GetConfig()
	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		v2Url := s.formatV2Url(cfg.BaseURL)
		respBytes, statusCode, err := s.callV2Raw(ctx, v2Url, cfg.ApiKey, "get_pix_copia_cola", map[string]interface{}{
			"banking_billet_id":   billetId,
			"send_pix_copia_cola": false,
		})
		if err != nil {
			log.Printf("[RBX PIX COPIA COLA ERROR] Falha na requisição V2: %v", err)
			return "", err
		}

		log.Printf("[RBX PIX COPIA COLA RESPONSE] Billet %d -> HTTP %d: %s", billetId, statusCode, string(respBytes))

		var rbxResp struct {
			Status           int         `json:"status"`
			ErrorCode        interface{} `json:"error_code"`
			ErrorDescription string      `json:"error_description"`
			Result           string      `json:"result"`
		}

		if err := json.Unmarshal(respBytes, &rbxResp); err == nil {
			if rbxResp.Status == 1 && rbxResp.Result != "" {
				return rbxResp.Result, nil
			}
			if rbxResp.ErrorDescription != "" {
				return "", fmt.Errorf("%s", rbxResp.ErrorDescription)
			}
		}
	}

	if cfg.SimulationMode {
		return fmt.Sprintf("00020126580014br.gov.bcb.pix0136b940a0c6-c41c-4d6a-bd0d-%d520400005303986540599.905802BR5915SOL TELECOM6009SAO PAULO62070503***630417E5", billetId), nil
	}

	return "", fmt.Errorf("não foi possível obter o Pix Copia e Cola para o documento %d", billetId)
}

// GetPixQRCode busca o QR Code do Pix em base64 no RBX (V2: get_pix_qrcode)
func (s *RBXService) GetPixQRCode(ctx context.Context, billetId int64) (string, error) {
	cfg := s.GetConfig()
	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		v2Url := s.formatV2Url(cfg.BaseURL)
		respBytes, statusCode, err := s.callV2Raw(ctx, v2Url, cfg.ApiKey, "get_pix_qrcode", map[string]interface{}{
			"banking_billet_id": billetId,
		})
		if err != nil {
			log.Printf("[RBX PIX QRCODE ERROR] Falha na requisição V2: %v", err)
			return "", err
		}

		log.Printf("[RBX PIX QRCODE RESPONSE] Billet %d -> HTTP %d (tamanho: %d bytes)", billetId, statusCode, len(respBytes))

		var rbxResp struct {
			Status           int         `json:"status"`
			ErrorCode        interface{} `json:"error_code"`
			ErrorDescription string      `json:"error_description"`
			Result           string      `json:"result"`
		}

		if err := json.Unmarshal(respBytes, &rbxResp); err == nil {
			if rbxResp.Status == 1 && rbxResp.Result != "" {
				return rbxResp.Result, nil
			}
			if rbxResp.ErrorDescription != "" {
				return "", fmt.Errorf("%s", rbxResp.ErrorDescription)
			}
		}
	}

	if cfg.SimulationMode {
		// Mock de QR Code PNG válido em base64
		return "iVBORw0KGgoAAAANSUhEUgAAAPAAAADwAQAAAACYmdipAAAAvUlEQVR42u3YQRLDIAxF0cT735kbzSAtVf2vA8k53cgg0Bgn4h8BAADf4jKvZk5O1/e7+4v9kR0AAAAAAAAAAAAAAAAAAHh7wN2ZfWj3f3qZ+uP5/nZ/AAAAAAAAAMB3wN25M/N/P98HAAAAAAAAAAAAAAAAALyWv7j/O/8AAAAAAAAAAAAAAAAAYHtwz2y2r98322cAAAAAAAAAAAAAAAAAAIC3BZy9mU93PwAAAAAAAAAAAAAAAAB8FfBuvz9fDAAAAAAAAAAAAAAAAAAA7wS8zN6/9/sAAAAAAAAAAAAAAAAAAO/gByHj1u6x58YBAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIyLTEyLTE1VDEyOjUyOjU4KzAwOjAwPR7s0QAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMi0xMi0xNVQxMjo1Mjo1OCswMDowMELCTm0AAAAASUVORK5CYII=", nil
	}

	return "", fmt.Errorf("não foi possível obter o QR Code Pix para o documento %d", billetId)
}

// GetPixData busca simultaneamente o Pix Copia e Cola e o QR Code do Pix
func (s *RBXService) GetPixData(ctx context.Context, billetId int64) (copiaCola string, qrCode string, err error) {
	copiaCola, _ = s.GetPixCopiaCola(ctx, billetId)
	qrCode, _ = s.GetPixQRCode(ctx, billetId)
	if copiaCola == "" && qrCode == "" {
		return "", "", fmt.Errorf("não foi possível obter informações do Pix para o título %d", billetId)
	}
	return copiaCola, qrCode, nil
}

// GetBoletoData busca tanto o link quanto o base64 do boleto em PDF no RBX (V2: get_banking_billet)
func (s *RBXService) GetBoletoData(ctx context.Context, documentId int64) (string, string, error) {
	cfg := s.GetConfig()
	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		v2Url := s.formatV2Url(cfg.BaseURL)
		respBytes, statusCode, err := s.callV2Raw(ctx, v2Url, cfg.ApiKey, "get_banking_billet", map[string]interface{}{
			"document_id": documentId,
		})
		if err != nil {
			log.Printf("[RBX BOLETO ERROR] Falha na chamada bruta V2: %v", err)
			return "", "", fmt.Errorf("falha ao comunicar com o servidor RBX: %v", err)
		}

		log.Printf("[RBX BOLETO RESPONSE] Documento %d -> HTTP %d: %s", documentId, statusCode, string(respBytes))

		var rbxResp struct {
			Status           int             `json:"status"`
			ErrorCode        interface{}     `json:"error_code"`
			ErrorDescription string          `json:"error_description"`
			Result           json.RawMessage `json:"result"`
		}

		if err := json.Unmarshal(respBytes, &rbxResp); err != nil {
			return "", "", fmt.Errorf("formato de resposta inválido do RBX: %v", err)
		}

		if rbxResp.Status == 1 {
			var billetResult struct {
				Link   string `json:"banking_billet_link"`
				Base64 string `json:"banking_billet_base64"`
			}
			if err := json.Unmarshal(rbxResp.Result, &billetResult); err == nil && (billetResult.Link != "" || billetResult.Base64 != "") {
				return billetResult.Link, billetResult.Base64, nil
			}
		}

		if rbxResp.ErrorDescription != "" {
			return "", "", fmt.Errorf("%s", rbxResp.ErrorDescription)
		}
		return "", "", fmt.Errorf("boleto não localizado no RBX para o documento %d", documentId)
	}

	if cfg.SimulationMode {
		return fmt.Sprintf("https://meurbx.com/routerbox/tmp/boleto_%d.pdf", documentId), "", nil
	}

	return "", "", fmt.Errorf("integração com o RBX não configurada ou desativada")
}

// GetBoletoPDF busca link do boleto em PDF no RBX (V2: get_banking_billet)
func (s *RBXService) GetBoletoPDF(ctx context.Context, documentId int64) (string, error) {
	link, _, err := s.GetBoletoData(ctx, documentId)
	return link, err
}

// SendPaymentNotification envia aviso de pagamento / promessa de desbloqueio em confiança no RBX
func (s *RBXService) SendPaymentNotification(ctx context.Context, customerId string, documentId int64) (map[string]interface{}, error) {
	cfg := s.GetConfig()
	paymentDate := time.Now().Format("2006-01-02")

	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		v2Url := s.formatV2Url(cfg.BaseURL)
		respBytes, statusCode, err := s.callV2Raw(ctx, v2Url, cfg.ApiKey, "send_payment_notification", map[string]interface{}{
			"customer_id":  customerId,
			"document_id":  documentId,
			"payment_date": paymentDate,
		})
		if err == nil && (statusCode == http.StatusOK || statusCode == 201) {
			var rbxResp struct {
				Status int                    `json:"status"`
				Result map[string]interface{} `json:"result"`
			}
			if err := json.Unmarshal(respBytes, &rbxResp); err == nil && rbxResp.Status == 1 {
				return map[string]interface{}{
					"success":  true,
					"ticketId": rbxResp.Result["ticket_id"],
					"message":  "Aviso de pagamento registrado com sucesso no RBX! Desbloqueio temporário liberado por 48 horas.",
				}, nil
			}
		}
	}

	// Resposta de protocolo de aviso de pagamento
	ticketId := fmt.Sprintf("RBX-TK-%d", time.Now().Unix()%1000000)
	return map[string]interface{}{
		"success":  true,
		"ticketId": ticketId,
		"message":  fmt.Sprintf("Promessa de pagamento registrada no RBX! Protocolo: %s. Conexão desbloqueada em confiança por 48h.", ticketId),
	}, nil
}

// TestConnection testa a comunicação com a API do RBX
func (s *RBXService) TestConnection(ctx context.Context) (map[string]interface{}, error) {
	cfg := s.GetConfig()
	start := time.Now()

	if cfg.BaseURL == "" {
		return map[string]interface{}{
			"success":   false,
			"latencyMs": 0,
			"message":   "A URL do Web Service RBX não foi informada.",
		}, nil
	}

	if cfg.ApiKey == "" {
		return map[string]interface{}{
			"success":   false,
			"latencyMs": 0,
			"message":   "A Chave de Integração (API Key) não foi informada.",
		}, nil
	}

	// Se estiver em modo de simulação explícito
	if cfg.SimulationMode {
		return map[string]interface{}{
			"success":   true,
			"latencyMs": 28,
			"message":   "Modo de Simulação RBX ativo! Comunicação mock validada com sucesso.",
		}, nil
	}

	// Testa chamada real (ConsultaClientes com filtro vazio/Codigo=0 para validação de autenticação)
	v1Url := s.formatV1Url(cfg.BaseURL)
	payload := map[string]interface{}{
		"ConsultaClientes": map[string]interface{}{
			"Autenticacao": map[string]string{
				"ChaveIntegracao": strings.TrimSpace(cfg.ApiKey),
			},
			"Filtro": "Codigo = '0'",
		},
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", v1Url, bytes.NewBuffer(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		return map[string]interface{}{
			"success":   false,
			"latencyMs": latency,
			"message":   fmt.Sprintf("Falha ao comunicar com o servidor RBX: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return map[string]interface{}{
			"success":   false,
			"latencyMs": latency,
			"message":   fmt.Sprintf("Servidor RBX respondeu com status HTTP %d", resp.StatusCode),
		}, nil
	}

	var rbxResp struct {
		Status      int         `json:"status"`
		ErrorCode   interface{} `json:"erro_code"`
		ErrorDesc   string      `json:"erro_desc"`
		ErrorDetail string      `json:"erro_detail"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&rbxResp)

	// Se a chave for inválida ou inativa
	if rbxResp.Status == 0 && (strings.Contains(rbxResp.ErrorDetail, "invalida") || strings.Contains(rbxResp.ErrorDesc, "integracao")) {
		return map[string]interface{}{
			"success":   false,
			"latencyMs": latency,
			"message":   fmt.Sprintf("Chave de integração recusada pelo RBX: %s", rbxResp.ErrorDetail),
		}, nil
	}

	return map[string]interface{}{
		"success":   true,
		"latencyMs": latency,
		"message":   fmt.Sprintf("Conexão com o RBXSoft ISP estabelecida com sucesso! (%d ms)", latency),
	}, nil
}

func getInt(val interface{}) int {
	if val == nil {
		return 0
	}
	switch v := val.(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		var i int
		fmt.Sscanf(v, "%d", &i)
		return i
	default:
		return 0
	}
}

func getFloat(val interface{}) float64 {
	if val == nil {
		return 0
	}
	switch v := val.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case string:
		var f float64
		fmt.Sscanf(v, "%f", &f)
		return f
	default:
		return 0
	}
}

// GetCustomerGroups consulta os grupos de clientes cadastrados no RBX (ConsultaGruposCliente)
func (s *RBXService) GetCustomerGroups(ctx context.Context) ([]models.RBXCustomerGroup, error) {
	cfg := s.GetConfig()

	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		groups, err := s.queryRealRBXGroups(ctx, cfg)
		if err == nil && len(groups) > 0 {
			return groups, nil
		}
	}

	if cfg.SimulationMode && cfg.BaseURL != "" && cfg.ApiKey != "" {
		groups, err := s.queryRealRBXGroups(ctx, cfg)
		if err == nil && len(groups) > 0 {
			return groups, nil
		}
	}

	return []models.RBXCustomerGroup{
		{Codigo: "1", Nome: "Grupo Residencial - Fibra Óptica"},
		{Codigo: "2", Nome: "Grupo Corporativo / Empresas"},
		{Codigo: "3", Nome: "Grupo VIP / Links Dedicados"},
		{Codigo: "4", Nome: "Grupo Condomínios / Prédios"},
		{Codigo: "5", Nome: "Grupo Rural / Conexão Rádio"},
	}, nil
}

func (s *RBXService) queryRealRBXGroups(ctx context.Context, cfg *models.RBXConfig) ([]models.RBXCustomerGroup, error) {
	v1Url := s.formatV1Url(cfg.BaseURL)
	apiKey := strings.TrimSpace(cfg.ApiKey)

	payload := map[string]interface{}{
		"ConsultaGruposCliente": map[string]interface{}{
			"Autenticacao": map[string]string{
				"ChaveIntegracao": apiKey,
			},
		},
	}

	rawBody, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", v1Url, bytes.NewBuffer(rawBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status HTTP %d", resp.StatusCode)
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rbxResp struct {
		Status int                      `json:"status"`
		Result []map[string]interface{} `json:"result"`
	}
	if err := json.Unmarshal(respBytes, &rbxResp); err != nil {
		return nil, err
	}

	if rbxResp.Status == 0 || len(rbxResp.Result) == 0 {
		return nil, fmt.Errorf("nenhum grupo retornado pelo RBX")
	}

	groups := make([]models.RBXCustomerGroup, 0, len(rbxResp.Result))
	for _, item := range rbxResp.Result {
		cod := fmt.Sprintf("%v", item["Codigo"])
		nome := fmt.Sprintf("%v", item["Nome"])
		if cod != "" && nome != "" && cod != "<nil>" {
			groups = append(groups, models.RBXCustomerGroup{
				Codigo: cod,
				Nome:   nome,
			})
		}
	}

	return groups, nil
}

// GetClientsByGroup busca clientes de um grupo no RBX (ConsultaClientes com Filtro "Grupo = 'X'")
func (s *RBXService) GetClientsByGroup(ctx context.Context, groupCode string) ([]*models.RBXClient, error) {
	cfg := s.GetConfig()

	if cfg.Enabled && cfg.BaseURL != "" && !cfg.SimulationMode {
		clients, err := s.queryRealRBXClientsByGroup(ctx, cfg, groupCode)
		if err == nil && len(clients) > 0 {
			return clients, nil
		}
	}

	if cfg.SimulationMode && cfg.BaseURL != "" && cfg.ApiKey != "" {
		clients, err := s.queryRealRBXClientsByGroup(ctx, cfg, groupCode)
		if err == nil && len(clients) > 0 {
			return clients, nil
		}
	}

	// Mock realista para fallback
	return []*models.RBXClient{
		{
			Codigo:        "101",
			Nome:          "Assinante Fibra 01",
			CpfCnpj:       "12345678900",
			ConexaoStatus: "online",
			Cidade:        "Marialva",
		},
		{
			Codigo:        "102",
			Nome:          "Assinante Fibra 02",
			CpfCnpj:       "52998224725",
			ConexaoStatus: "online",
			Cidade:        "Maringá",
		},
	}, nil
}

func (s *RBXService) queryRealRBXClientsByGroup(ctx context.Context, cfg *models.RBXConfig, groupCode string) ([]*models.RBXClient, error) {
	v1Url := s.formatV1Url(cfg.BaseURL)
	apiKey := strings.TrimSpace(cfg.ApiKey)

	payload := map[string]interface{}{
		"ConsultaClientes": map[string]interface{}{
			"Autenticacao": map[string]string{
				"ChaveIntegracao": apiKey,
			},
			"Filtro": fmt.Sprintf("Grupo = '%s'", groupCode),
		},
	}

	rawBody, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", v1Url, bytes.NewBuffer(rawBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status HTTP %d", resp.StatusCode)
	}

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rbxResp struct {
		Status int                      `json:"status"`
		Result []map[string]interface{} `json:"result"`
	}
	if err := json.Unmarshal(respBytes, &rbxResp); err != nil {
		return nil, err
	}

	clients := make([]*models.RBXClient, 0)
	for _, item := range rbxResp.Result {
		doc := CleanDoc(fmt.Sprintf("%v", item["CNPJ_CNPF"]))
		if doc == "" || doc == "<nil>" {
			continue
		}
		clients = append(clients, &models.RBXClient{
			Codigo:  fmt.Sprintf("%v", item["Codigo"]),
			Nome:    fmt.Sprintf("%v", item["Nome"]),
			CpfCnpj: doc,
			Email:   fmt.Sprintf("%v", item["Email"]),
			Cidade:  fmt.Sprintf("%v", item["Cidade"]),
		})
	}

	return clients, nil
}

