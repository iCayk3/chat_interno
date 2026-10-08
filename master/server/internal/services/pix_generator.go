package services

import (
	"fmt"
	"strings"
	"unicode"
)

// GeneratePixPayload gera o código PIX Copia e Cola no padrão oficial EMVCo / Banco Central do Brasil
func GeneratePixPayload(key, name, city, txid string, amount float64) string {
	cleanKey := strings.TrimSpace(key)
	if cleanKey == "" {
		return ""
	}

	cleanName := removeAccents(strings.TrimSpace(name))
	if cleanName == "" {
		cleanName = "SOL TELECOM"
	}
	if len(cleanName) > 25 {
		cleanName = cleanName[:25]
	}

	cleanCity := removeAccents(strings.TrimSpace(city))
	if cleanCity == "" {
		cleanCity = "SAO PAULO"
	}
	if len(cleanCity) > 15 {
		cleanCity = cleanCity[:15]
	}

	cleanTxid := strings.TrimSpace(txid)
	if cleanTxid == "" {
		cleanTxid = "***"
	}
	if len(cleanTxid) > 25 {
		cleanTxid = cleanTxid[:25]
	}

	// 1. Merchant Account Information (Tag 26)
	gui := formatEMV("00", "BR.GOV.BCB.PIX")
	pixKey := formatEMV("01", cleanKey)
	merchantAccount := formatEMV("26", gui+pixKey)

	// 2. Monta blocos padrão
	payload := formatEMV("00", "01") // Payload Format Indicator
	payload += merchantAccount
	payload += formatEMV("52", "0000") // Merchant Category Code
	payload += formatEMV("53", "986")  // Currency Code (BRL)

	if amount > 0 {
		amountStr := fmt.Sprintf("%.2f", amount)
		payload += formatEMV("54", amountStr)
	}

	payload += formatEMV("58", "BR")
	payload += formatEMV("59", cleanName)
	payload += formatEMV("60", cleanCity)

	// Additional Data Field Template (Tag 62)
	txidBlock := formatEMV("05", cleanTxid)
	payload += formatEMV("62", txidBlock)

	// 3. Adiciona início do CRC16 (Tag 63)
	payload += "6304"

	// 4. Calcula CRC-16 (CCITT-FALSE 0x1021)
	crc := calculateCRC16(payload)

	return payload + crc
}

func formatEMV(id, value string) string {
	return fmt.Sprintf("%s%02d%s", id, len(value), value)
}

func calculateCRC16(str string) string {
	var crc uint16 = 0xFFFF
	polynomial := uint16(0x1021)
	bytes := []byte(str)

	for _, b := range bytes {
		crc ^= uint16(b) << 8
		for i := 0; i < 8; i++ {
			if (crc & 0x8000) != 0 {
				crc = (crc << 1) ^ polynomial
			} else {
				crc <<= 1
			}
		}
	}

	return fmt.Sprintf("%04X", crc)
}

func removeAccents(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case 'á', 'à', 'ã', 'â', 'ä', 'Á', 'À', 'Ã', 'Â', 'Ä':
			b.WriteRune('A')
		case 'é', 'è', 'ê', 'ë', 'É', 'È', 'Ê', 'Ë':
			b.WriteRune('E')
		case 'í', 'ì', 'î', 'ï', 'Í', 'Ì', 'Î', 'Ï':
			b.WriteRune('I')
		case 'ó', 'ò', 'õ', 'ô', 'ö', 'Ó', 'Ò', 'Õ', 'Ô', 'Ö':
			b.WriteRune('O')
		case 'ú', 'ù', 'û', 'ü', 'Ú', 'Ù', 'Û', 'Ü':
			b.WriteRune('U')
		case 'ç', 'Ç':
			b.WriteRune('C')
		default:
			if unicode.IsLetter(r) || unicode.IsDigit(r) || r == ' ' || r == '-' || r == '.' {
				b.WriteRune(unicode.ToUpper(r))
			}
		}
	}
	return b.String()
}
