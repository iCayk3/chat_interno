package services

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// FileService gerencia o ciclo de vida de arquivos temporários (como boletos PDF)
// e garante a remoção automática após 1 hora para não consumir espaço em disco.
type FileService struct {
	baseDir    string
	httpClient *http.Client
	mu         sync.RWMutex
}

func NewFileService(baseDir string) *FileService {
	if baseDir == "" {
		baseDir = "storage/temp_boletos"
	}

	// Garante que a pasta de armazenamento exista
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		log.Printf("⚠️ Erro ao criar diretório temporário %s: %v", baseDir, err)
	}

	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   20 * time.Second,
	}

	fs := &FileService{
		baseDir:    baseDir,
		httpClient: client,
	}

	// Inicia a rotina de limpeza periódica para arquivos com mais de 1 hora
	go fs.startAutoCleanup(20*time.Minute, 1*time.Hour)

	return fs
}

// DownloadAndSaveBoleto baixa o PDF do boleto a partir da URL do RBX (ou decodifica base64 se disponível)
// e agenda a exclusão definitiva do HD após 1 hora.
func (s *FileService) DownloadAndSaveBoleto(ctx context.Context, documentID int64, pdfURL, base64Content string) (string, string, error) {
	uniqueID := uuid.New().String()[:8]
	filename := fmt.Sprintf("boleto_%d_%s.pdf", documentID, uniqueID)
	destPath := filepath.Join(s.baseDir, filename)

	// 1. Se vier base64 direto do RBX
	if base64Content != "" {
		rawPDF, err := base64.StdEncoding.DecodeString(base64Content)
		if err == nil && len(rawPDF) > 0 {
			if err := os.WriteFile(destPath, rawPDF, 0644); err != nil {
				return "", "", fmt.Errorf("falha ao salvar boleto PDF do base64: %w", err)
			}
			s.scheduleDeletion(destPath, 1*time.Hour)
			return filename, destPath, nil
		}
	}

	// 2. Se houver URL válida para download
	if pdfURL != "" && strings.HasPrefix(pdfURL, "http") {
		req, err := http.NewRequestWithContext(ctx, "GET", pdfURL, nil)
		if err == nil {
			resp, err := s.httpClient.Do(req)
			if err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()

				outFile, err := os.Create(destPath)
				if err == nil {
					defer outFile.Close()
					_, err = io.Copy(outFile, resp.Body)
					if err == nil {
						s.scheduleDeletion(destPath, 1*time.Hour)
						log.Printf("📄 [BOLETO DOWNLOAD] Boleto %d salvo com sucesso em %s (expira em 1h)", documentID, destPath)
						return filename, destPath, nil
					}
				}
			}
		}
	}

	// 3. Fallback: Se for simulação ou o link remoto estiver inacessível, gera um PDF padrão legível
	samplePDF := []byte(fmt.Sprintf(
		"%%PDF-1.4\n1 0 obj\n<< /Title (Boleto %d) /Author (SOL Provedor) >>\nendobj\n"+
			"2 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n"+
			"3 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n"+
			"4 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n"+
			"5 0 obj\n<< /Length 120 >>\nstream\nBT /F1 16 Tf 50 700 Td (SOL PROVEDOR DE INTERNET - 2a VIA DE BOLETO) Tj ET\n"+
			fmt.Sprintf("BT /F1 12 Tf 50 660 Td (Documento: %d - Gerado em: %s) Tj ET\n", documentID, time.Now().Format("02/01/2006 15:04"))+
			"endstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000078 00000 n \n0000000125 00000 n \n0000000185 00000 n \n0000000270 00000 n \ntrailer\n<< /Size 6 /Root 2 0 R >>\nstartxref\n450\n%%%%EOF",
		documentID,
	))

	if err := os.WriteFile(destPath, samplePDF, 0644); err != nil {
		return "", "", fmt.Errorf("falha ao criar arquivo de boleto temporário: %w", err)
	}

	s.scheduleDeletion(destPath, 1*time.Hour)
	log.Printf("📄 [BOLETO FALLBACK] Boleto gerado localmente em %s (expira em 1h)", destPath)
	return filename, destPath, nil
}

// scheduleDeletion agenda a exclusão do arquivo no sistema operacional após a duração informada
func (s *FileService) scheduleDeletion(filePath string, duration time.Duration) {
	time.AfterFunc(duration, func() {
		if err := os.Remove(filePath); err == nil {
			log.Printf("🗑️ [BOLETO CLEANUP] Arquivo temporário excluído após 1 hora: %s", filePath)
		}
	})
}

// GetBoletoFilePath valida e retorna o caminho físico do arquivo temporário se ainda existir
func (s *FileService) GetBoletoFilePath(filename string) (string, bool) {
	cleanName := filepath.Base(filename)
	if cleanName == "" || cleanName == "." || cleanName == ".." || !strings.HasSuffix(cleanName, ".pdf") {
		return "", false
	}

	fullPath := filepath.Join(s.baseDir, cleanName)
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		return "", false
	}

	return fullPath, true
}

// startAutoCleanup limpa periodicamente quaisquer arquivos que tenham permanecido por mais de maxAge
func (s *FileService) startAutoCleanup(interval, maxAge time.Duration) {
	ticker := time.NewTicker(interval)
	for range ticker.C {
		s.cleanupExpiredFiles(maxAge)
	}
}

func (s *FileService) cleanupExpiredFiles(maxAge time.Duration) {
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		return
	}

	now := time.Now()
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".pdf") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if now.Sub(info.ModTime()) > maxAge {
			path := filepath.Join(s.baseDir, entry.Name())
			if err := os.Remove(path); err == nil {
				log.Printf("🧹 [AUTO CLEANUP] Removido arquivo de boleto expirado (> 1h): %s", entry.Name())
			}
		}
	}
}
