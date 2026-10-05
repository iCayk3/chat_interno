package models

// RBXClient representa um cliente cadastrado no ERP RBXSoft ISP
type RBXClient struct {
	Codigo            string `json:"codigo"`
	Nome              string `json:"nome"`
	NomeFantasia      string `json:"nomeFantasia,omitempty"`
	Tipo              string `json:"tipo"` // "F" ou "J"
	CpfCnpj           string `json:"cpfCnpj"`
	Endereco          string `json:"endereco"`
	Numero            string `json:"numero"`
	Bairro            string `json:"bairro"`
	Cidade            string `json:"cidade"`
	Cep               string `json:"cep"`
	Email             string `json:"email"`
	Telefone          string `json:"telefone"`
	Celular           string `json:"celular"`
	AvisoPagamento    string `json:"avisoPagamento"` // "S" (pode promessa), "A" (alerta), "N" (não pode)
	Status            string `json:"status"`         // "A" (ativo), "I" (inativo)
	ContratoDescricao string `json:"contratoDescricao,omitempty"`
	ConexaoStatus     string `json:"conexaoStatus,omitempty"` // "online", "bloqueado", "reducao"
}

// RBXUnpaidDocument representa um título/fatura a receber no RBX ISP
type RBXUnpaidDocument struct {
	ID             int64   `json:"id"`
	AccountNumber  int     `json:"accountNumber"`
	DueDate        string  `json:"dueDate"`
	DocumentNumber string  `json:"documentNumber"`
	BankNumber     string  `json:"bankNumber"`
	Value          float64 `json:"value"`
	Historic       string  `json:"historic"`
	Comments       string  `json:"comments,omitempty"`
	PixCopiaCola   string  `json:"pixCopiaCola,omitempty"`
	BoletoLink     string  `json:"boletoLink,omitempty"`
	Status         string  `json:"status"` // "aberto", "vencido", "hoje"
}

// RBXFinancialSummary agrega a situação financeira do cliente consultada no RBX
type RBXFinancialSummary struct {
	CustomerId         string              `json:"customerId"`
	CustomerName       string              `json:"customerName"`
	CpfCnpj            string              `json:"cpfCnpj"`
	TotalUnpaid        float64             `json:"totalUnpaid"`
	OverdueCount       int                 `json:"overdueCount"`
	CanRequestPromessa bool                `json:"canRequestPromessa"`
	AvisoPagamento     string              `json:"avisoPagamento"`
	Documents          []RBXUnpaidDocument `json:"documents"`
}

// RBXConfig armazena as credenciais e parâmetros de conexão ao Web Service do RBX
type RBXConfig struct {
	BaseURL        string `json:"baseUrl"`
	ApiKey         string `json:"apiKey"`
	Version        string `json:"version"` // "v1" ou "v2"
	Enabled        bool   `json:"enabled"`
	SimulationMode bool   `json:"simulationMode"`
}
