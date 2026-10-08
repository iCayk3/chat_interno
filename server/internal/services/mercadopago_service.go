package services

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/models"
)

type MercadoPagoService struct {
	httpClient *http.Client
	baseURL    string
}

func NewMercadoPagoService() *MercadoPagoService {
	return &MercadoPagoService{
		httpClient: &http.Client{
			Timeout: 12 * time.Second,
		},
		baseURL: "https://api.mercadopago.com",
	}
}

// MPPaymentResponse mapeia a resposta oficial de pagamentos do Mercado Pago
type MPPaymentResponse struct {
	ID                 int64  `json:"id"`
	Status             string `json:"status"`
	StatusDetail       string `json:"status_detail"`
	TransactionAmount  float64 `json:"transaction_amount"`
	Description        string `json:"description"`
	DateApproved       string `json:"date_approved"`
	PointOfInteraction struct {
		TransactionData struct {
			QRCode       string `json:"qr_code"`
			QRCodeBase64 string `json:"qr_code_base64"`
			TicketURL    string `json:"ticket_url"`
		} `json:"transaction_data"`
	} `json:"point_of_interaction"`
	TransactionDetails struct {
		ExternalResourceURL string `json:"external_resource_url"`
	} `json:"transaction_details"`
	Barcode struct {
		Content string `json:"content"`
	} `json:"barcode"`
}

// TestCredentials valida se o Access Token do Mercado Pago é autêntico e válido
func (s *MercadoPagoService) TestCredentials(ctx context.Context, accessToken string) (bool, string, error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return false, "", errors.New("access token do Mercado Pago é obrigatório")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/v1/users/me", nil)
	if err != nil {
		return false, "", fmt.Errorf("erro ao montar requisição: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false, "", fmt.Errorf("falha ao conectar na API do Mercado Pago: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[MERCADO PAGO AUTH FAILED] Status %d: %s", resp.StatusCode, string(body))
		return false, "", fmt.Errorf("credencial inválida ou sem permissão (código HTTP %d)", resp.StatusCode)
	}

	var userInfo struct {
		ID       int64  `json:"id"`
		Nickname string `json:"nickname"`
		Email    string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		return true, "Conectado com sucesso", nil
	}

	msg := fmt.Sprintf("Conta conectada: %s (ID %d)", userInfo.Nickname, userInfo.ID)
	return true, msg, nil
}

// CreatePixPayment gera uma cobrança Pix dinâmica com QR Code Copia e Cola e Base64
func (s *MercadoPagoService) CreatePixPayment(
	ctx context.Context,
	accessToken string,
	customer *models.NativeCustomer,
	amount float64,
	description string,
) (*MPPaymentResponse, error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return nil, errors.New("Mercado Pago não está configurado (Access Token ausente)")
	}
	if err := ValidateAmount(amount); err != nil {
		return nil, err
	}

	cleanDoc := CleanNumberDoc(customer.CPFCnpj)
	docType := "CPF"
	if len(cleanDoc) == 14 {
		docType = "CNPJ"
	}

	// Separa primeiro e último nome com segurança
	names := strings.Fields(strings.TrimSpace(customer.Name))
	firstName := "Cliente"
	lastName := "SOL"
	if len(names) > 0 {
		firstName = names[0]
	}
	if len(names) > 1 {
		lastName = strings.Join(names[1:], " ")
	}

	email := strings.TrimSpace(customer.Email)
	if email == "" || ValidateEmail(email) != nil {
		email = "cliente." + cleanDoc + "@pagamentos.sol.net.br"
	}

	payload := map[string]interface{}{
		"transaction_amount": amount,
		"description":        description,
		"payment_method_id":  "pix",
		"payer": map[string]interface{}{
			"email":      email,
			"first_name": firstName,
			"last_name":  lastName,
			"identification": map[string]string{
				"type":   docType,
				"number": cleanDoc,
			},
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("erro ao serializar payload Pix: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/v1/payments", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Idempotency-Key", uuid.New().String())

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao contatar Mercado Pago: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("falha ao ler resposta do Mercado Pago: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[MERCADO PAGO PIX ERROR] Status %d: %s", resp.StatusCode, string(respBody))
		var errResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		_ = json.Unmarshal(respBody, &errResp)
		msg := errResp.Message
		if msg == "" {
			msg = errResp.Error
		}
		if msg == "" {
			msg = fmt.Sprintf("Erro HTTP %d ao emitir Pix", resp.StatusCode)
		}
		return nil, errors.New(msg)
	}

	var paymentRes MPPaymentResponse
	if err := json.Unmarshal(respBody, &paymentRes); err != nil {
		return nil, fmt.Errorf("erro ao interpretar resposta Pix: %w", err)
	}

	return &paymentRes, nil
}

// CreateBoletoPayment emite um boleto bancário no Mercado Pago com código de barras e link de PDF
func (s *MercadoPagoService) CreateBoletoPayment(
	ctx context.Context,
	accessToken string,
	customer *models.NativeCustomer,
	amount float64,
	dueDate string, // YYYY-MM-DD
	description string,
) (*MPPaymentResponse, error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return nil, errors.New("Mercado Pago não está configurado (Access Token ausente)")
	}
	if err := ValidateAmount(amount); err != nil {
		return nil, err
	}

	cleanDoc := CleanNumberDoc(customer.CPFCnpj)
	docType := "CPF"
	if len(cleanDoc) == 14 {
		docType = "CNPJ"
	}

	names := strings.Fields(strings.TrimSpace(customer.Name))
	firstName := "Cliente"
	lastName := "SOL"
	if len(names) > 0 {
		firstName = names[0]
	}
	if len(names) > 1 {
		lastName = strings.Join(names[1:], " ")
	}

	email := strings.TrimSpace(customer.Email)
	if email == "" || ValidateEmail(email) != nil {
		email = "cliente." + cleanDoc + "@pagamentos.sol.net.br"
	}

	// Formata data de expiração ISO 8601 com horário às 23:59:59
	expirationDate := ""
	if dueDate != "" {
		if t, err := time.Parse("2006-01-02", dueDate); err == nil {
			expirationDate = t.Format("2006-01-02T23:59:59.000-03:00")
		}
	}
	if expirationDate == "" {
		expirationDate = time.Now().AddDate(0, 0, 3).Format("2006-01-02T23:59:59.000-03:00")
	}

	payerMap := map[string]interface{}{
		"email":      email,
		"first_name": firstName,
		"last_name":  lastName,
		"identification": map[string]string{
			"type":   docType,
			"number": cleanDoc,
		},
	}

	// Endereço completo para o boleto
	cleanCep := CleanNumberDoc(customer.PostalCode)
	if cleanCep != "" && customer.Address != "" {
		payerMap["address"] = map[string]string{
			"zip_code":      cleanCep,
			"street_name":   customer.Address,
			"street_number": customer.Number,
			"neighborhood":  customer.Neighborhood,
			"city":          customer.City,
			"federal_unit":  customer.State,
		}
	}

	payload := map[string]interface{}{
		"transaction_amount": amount,
		"description":        description,
		"payment_method_id":  "bolbradesco",
		"date_of_expiration": expirationDate,
		"payer":              payerMap,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("erro ao serializar payload Boleto: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/v1/payments", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Idempotency-Key", uuid.New().String())

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao contatar Mercado Pago: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("falha ao ler resposta do Mercado Pago: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("[MERCADO PAGO BOLETO ERROR] Status %d: %s", resp.StatusCode, string(respBody))
		var errResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		_ = json.Unmarshal(respBody, &errResp)
		msg := errResp.Message
		if msg == "" {
			msg = errResp.Error
		}
		if msg == "" {
			msg = fmt.Sprintf("Erro HTTP %d ao emitir Boleto", resp.StatusCode)
		}
		return nil, errors.New(msg)
	}

	var paymentRes MPPaymentResponse
	if err := json.Unmarshal(respBody, &paymentRes); err != nil {
		return nil, fmt.Errorf("erro ao interpretar resposta Boleto: %w", err)
	}

	return &paymentRes, nil
}

// GetPaymentStatus consulta o status de uma transação diretamente na API do Mercado Pago
func (s *MercadoPagoService) GetPaymentStatus(ctx context.Context, accessToken, paymentID string) (*MPPaymentResponse, error) {
	token := strings.TrimSpace(accessToken)
	if token == "" {
		return nil, errors.New("access token não configurado")
	}

	cleanID := strings.TrimSpace(paymentID)
	if cleanID == "" {
		return nil, errors.New("payment ID é obrigatório")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/v1/payments/%s", s.baseURL, cleanID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("falha ao consultar pagamento: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pagamento não localizado no Mercado Pago (código %d)", resp.StatusCode)
	}

	var res MPPaymentResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	return &res, nil
}

// ValidateWebhookSignature verifica a autenticidade criptográfica de um webhook do Mercado Pago usando HMAC-SHA256
func (s *MercadoPagoService) ValidateWebhookSignature(xSignature, xRequestId, dataID, secret string) bool {
	secretClean := strings.TrimSpace(secret)
	if secretClean == "" {
		// Se não há secret configurado, não valida via assinatura local
		return true
	}

	// Extrai ts e v1 do header x-signature (formato: "ts=1700000000,v1=abc123def...")
	parts := strings.Split(xSignature, ",")
	ts := ""
	v1 := ""
	for _, p := range parts {
		kv := strings.SplitN(strings.TrimSpace(p), "=", 2)
		if len(kv) == 2 {
			if kv[0] == "ts" {
				ts = kv[1]
			} else if kv[0] == "v1" {
				v1 = kv[1]
			}
		}
	}

	if ts == "" || v1 == "" {
		return false
	}

	// Template de validação oficial do Mercado Pago:
	// id:[data.id_url_or_query];request-id:[x-request-id_header];ts:[ts];
	manifest := fmt.Sprintf("id:%s;request-id:%s;ts:%s;", dataID, xRequestId, ts)

	mac := hmac.New(sha256.New, []byte(secretClean))
	mac.Write([]byte(manifest))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(expectedSignature), []byte(v1))
}
