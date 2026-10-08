package services

import (
	"errors"
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	phoneRegex = regexp.MustCompile(`^[0-9]{10,13}$`)
)

// CleanNumberDoc remove qualquer pontuação ou caractere não numérico
func CleanNumberDoc(doc string) string {
	var sb strings.Builder
	for _, r := range doc {
		if r >= '0' && r <= '9' {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// ValidateCPF valida matematicamente os dígitos verificadores de um CPF brasileiro
func ValidateCPF(cpf string) error {
	clean := CleanNumberDoc(cpf)
	if len(clean) != 11 {
		return errors.New("CPF deve conter exatamente 11 dígitos")
	}

	// Rejeita sequências repetidas (ex: 111.111.111-11, 000.000.000-00)
	allEqual := true
	for i := 1; i < 11; i++ {
		if clean[i] != clean[0] {
			allEqual = false
			break
		}
	}
	if allEqual {
		return errors.New("CPF inválido (dígitos repetidos)")
	}

	// 1º Dígito verificador
	sum := 0
	for i := 0; i < 9; i++ {
		digit, _ := strconv.Atoi(string(clean[i]))
		sum += digit * (10 - i)
	}
	rem := (sum * 10) % 11
	if rem == 10 {
		rem = 0
	}
	d1, _ := strconv.Atoi(string(clean[9]))
	if rem != d1 {
		return errors.New("CPF inválido (primeiro dígito verificador incorreto)")
	}

	// 2º Dígito verificador
	sum = 0
	for i := 0; i < 10; i++ {
		digit, _ := strconv.Atoi(string(clean[i]))
		sum += digit * (11 - i)
	}
	rem = (sum * 10) % 11
	if rem == 10 {
		rem = 0
	}
	d2, _ := strconv.Atoi(string(clean[10]))
	if rem != d2 {
		return errors.New("CPF inválido (segundo dígito verificador incorreto)")
	}

	return nil
}

// ValidateCNPJ valida matematicamente os dígitos verificadores de um CNPJ brasileiro
func ValidateCNPJ(cnpj string) error {
	clean := CleanNumberDoc(cnpj)
	if len(clean) != 14 {
		return errors.New("CNPJ deve conter exatamente 14 dígitos")
	}

	allEqual := true
	for i := 1; i < 14; i++ {
		if clean[i] != clean[0] {
			allEqual = false
			break
		}
	}
	if allEqual {
		return errors.New("CNPJ inválido (dígitos repetidos)")
	}

	// 1º Dígito
	weights1 := []int{5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
	sum := 0
	for i := 0; i < 12; i++ {
		d, _ := strconv.Atoi(string(clean[i]))
		sum += d * weights1[i]
	}
	rem := sum % 11
	d1 := 0
	if rem >= 2 {
		d1 = 11 - rem
	}
	realD1, _ := strconv.Atoi(string(clean[12]))
	if d1 != realD1 {
		return errors.New("CNPJ inválido (primeiro dígito verificador incorreto)")
	}

	// 2º Dígito
	weights2 := []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
	sum = 0
	for i := 0; i < 13; i++ {
		d, _ := strconv.Atoi(string(clean[i]))
		sum += d * weights2[i]
	}
	rem = sum % 11
	d2 := 0
	if rem >= 2 {
		d2 = 11 - rem
	}
	realD2, _ := strconv.Atoi(string(clean[13]))
	if d2 != realD2 {
		return errors.New("CNPJ inválido (segundo dígito verificador incorreto)")
	}

	return nil
}

// ValidateCPFOrCNPJ aceita CPF (11) ou CNPJ (14) com validação matemática estrita
func ValidateCPFOrCNPJ(doc string) error {
	clean := CleanNumberDoc(doc)
	if len(clean) == 11 {
		return ValidateCPF(clean)
	} else if len(clean) == 14 {
		return ValidateCNPJ(clean)
	}
	return fmt.Errorf("documento inválido: esperado CPF (11 dígitos) ou CNPJ (14 dígitos), recebido %d dígitos", len(clean))
}

// ValidateEmail checa formato de e-mail seguro
func ValidateEmail(email string) error {
	clean := strings.TrimSpace(email)
	if clean == "" {
		return errors.New("e-mail não pode ser vazio")
	}
	if len(clean) > 150 {
		return errors.New("e-mail excede o tamanho máximo permitido")
	}
	if !emailRegex.MatchString(clean) {
		return errors.New("formato de e-mail inválido")
	}
	return nil
}

// ValidatePhone checa formato de telefone
func ValidatePhone(phone string) error {
	clean := CleanNumberDoc(phone)
	if clean == "" {
		return errors.New("telefone não pode ser vazio")
	}
	if len(clean) < 10 || len(clean) > 13 {
		return errors.New("telefone deve conter DDD e número (10 a 13 dígitos)")
	}
	return nil
}

// SanitizeString escapa caracteres perigosos contra injeção de HTML / XSS
func SanitizeString(input string) string {
	clean := strings.TrimSpace(input)
	clean = html.EscapeString(clean)
	return clean
}

// ValidateAmount garante que valores financeiros sejam positivos e razoáveis
func ValidateAmount(amount float64) error {
	if amount <= 0 {
		return errors.New("o valor deve ser maior que zero (R$ 0,00)")
	}
	if amount > 1000000 {
		return errors.New("o valor excede o limite máximo permitido por transação (R$ 1.000.000,00)")
	}
	return nil
}
