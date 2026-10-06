package services

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"chat-interno-server/internal/database"
	"chat-interno-server/internal/models"
)

type NetworkService struct {
	mu sync.RWMutex
	db *database.DB
	// Cache em memória
	olts []*models.NetworkOlt
}

func NewNetworkService(db *database.DB) *NetworkService {
	s := &NetworkService{
		db:   db,
		olts: make([]*models.NetworkOlt, 0),
	}
	s.Reload()
	return s
}

// Reload recarrega os dados do banco para a memória
func (s *NetworkService) Reload() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		tree, err := s.db.GetNetworkTree()
		if err == nil {
			s.olts = tree
			return nil
		}
	}
	return nil
}

// GetTree retorna a árvore completa de OLTs -> Slots -> PONs -> CTOs
func (s *NetworkService) GetTree() ([]*models.NetworkOlt, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.db != nil {
		tree, err := s.db.GetNetworkTree()
		if err == nil {
			return tree, nil
		}
	}

	return s.olts, nil
}

// CreateOlt cadastra uma nova OLT (suporta geração automática de slots e PONs)
func (s *NetworkService) CreateOlt(olt *models.NetworkOlt) (*models.NetworkOlt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name := strings.TrimSpace(olt.Name)
	if name == "" {
		return nil, errors.New("o nome da OLT é obrigatório")
	}

	if olt.ID == "" {
		olt.ID = "olt-" + uuid.New().String()[:8]
	}
	olt.Name = strings.ToUpper(name)
	olt.Model = strings.TrimSpace(olt.Model)
	olt.IP = strings.TrimSpace(olt.IP)
	olt.Location = strings.TrimSpace(olt.Location)
	olt.Description = strings.TrimSpace(olt.Description)
	olt.CreatedAt = time.Now().UTC()
	olt.UpdatedAt = olt.CreatedAt
	olt.Slots = make([]*models.NetworkSlot, 0)

	if s.db != nil {
		if err := s.db.CreateOlt(olt); err != nil {
			return nil, fmt.Errorf("erro ao salvar OLT no banco: %w", err)
		}

		// Se informado quantidade de slots, gera os slots e suas PONs automaticamente
		if olt.SlotCount > 0 {
			for slotNum := 1; slotNum <= olt.SlotCount; slotNum++ {
				slot := &models.NetworkSlot{
					ID:         fmt.Sprintf("slot-%s-%02d", olt.ID, slotNum),
					OltID:      olt.ID,
					SlotNumber: slotNum,
					Name:       fmt.Sprintf("Slot %02d", slotNum),
					CardType:   "GPON",
					Pons:       make([]*models.NetworkPon, 0),
					CreatedAt:  time.Now().UTC(),
				}
				if err := s.db.CreateSlot(slot); err != nil {
					return nil, fmt.Errorf("erro ao gerar slot %d: %w", slotNum, err)
				}

				// Gera as PONs deste slot
				if olt.PonsPerSlot > 0 {
					for ponNum := 1; ponNum <= olt.PonsPerSlot; ponNum++ {
						pon := &models.NetworkPon{
							ID:        fmt.Sprintf("pon-%s-%02d-%02d", olt.ID, slotNum, ponNum),
							SlotID:    slot.ID,
							OltID:     olt.ID,
							PonNumber: ponNum,
							Name:      fmt.Sprintf("PON %d/%d", slotNum, ponNum),
							SfpType:   "C+",
							Ctos:      make([]*models.NetworkCto, 0),
							CreatedAt: time.Now().UTC(),
						}
						if err := s.db.CreatePon(pon); err != nil {
							return nil, fmt.Errorf("erro ao gerar PON %d do slot %d: %w", ponNum, slotNum, err)
						}
						slot.Pons = append(slot.Pons, pon)
					}
				}
				olt.Slots = append(olt.Slots, slot)
			}
		}
	}

	s.olts = append(s.olts, olt)
	return olt, nil
}

// UpdateOlt atualiza dados da OLT
func (s *NetworkService) UpdateOlt(id string, olt *models.NetworkOlt) (*models.NetworkOlt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name := strings.TrimSpace(olt.Name)
	if name == "" {
		return nil, errors.New("o nome da OLT é obrigatório")
	}

	olt.ID = id
	olt.Name = strings.ToUpper(name)
	olt.UpdatedAt = time.Now().UTC()

	if s.db != nil {
		if err := s.db.UpdateOlt(olt); err != nil {
			return nil, fmt.Errorf("erro ao atualizar OLT no banco: %w", err)
		}
	}

	return olt, nil
}

// DeleteOlt remove uma OLT e todos os seus slots, PONs e CTOs
func (s *NetworkService) DeleteOlt(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		if err := s.db.DeleteOlt(id); err != nil {
			return fmt.Errorf("erro ao excluir OLT no banco: %w", err)
		}
	}

	filtered := make([]*models.NetworkOlt, 0)
	for _, o := range s.olts {
		if o.ID != id {
			filtered = append(filtered, o)
		}
	}
	s.olts = filtered
	return nil
}

// CreateSlot adiciona um novo Slot de placa PON à OLT (suporta gerar PONs automaticamente)
func (s *NetworkService) CreateSlot(slot *models.NetworkSlot) (*models.NetworkSlot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if slot.OltID == "" {
		return nil, errors.New("a OLT de destino é obrigatória para o Slot")
	}
	name := strings.TrimSpace(slot.Name)
	if name == "" {
		slot.Name = fmt.Sprintf("Slot %d", slot.SlotNumber)
	}

	if slot.ID == "" {
		slot.ID = "slot-" + uuid.New().String()[:8]
	}
	slot.CreatedAt = time.Now().UTC()
	slot.Pons = make([]*models.NetworkPon, 0)

	if s.db != nil {
		if err := s.db.CreateSlot(slot); err != nil {
			return nil, fmt.Errorf("erro ao salvar Slot no banco: %w", err)
		}

		// Se informado quantidade de PONs para este slot, gera automaticamente
		if slot.PonCount > 0 {
			for ponNum := 1; ponNum <= slot.PonCount; ponNum++ {
				pon := &models.NetworkPon{
					ID:        fmt.Sprintf("pon-%s-%02d", slot.ID, ponNum),
					SlotID:    slot.ID,
					OltID:     slot.OltID,
					PonNumber: ponNum,
					Name:      fmt.Sprintf("PON %d/%d", slot.SlotNumber, ponNum),
					SfpType:   "C+",
					Ctos:      make([]*models.NetworkCto, 0),
					CreatedAt: time.Now().UTC(),
				}
				if err := s.db.CreatePon(pon); err != nil {
					return nil, fmt.Errorf("erro ao gerar PON %d do slot: %w", ponNum, err)
				}
				slot.Pons = append(slot.Pons, pon)
			}
		}
	}

	return slot, nil
}

// UpdateSlot atualiza dados do Slot
func (s *NetworkService) UpdateSlot(id string, slot *models.NetworkSlot) (*models.NetworkSlot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	slot.ID = id
	if s.db != nil {
		if err := s.db.UpdateSlot(slot); err != nil {
			return nil, fmt.Errorf("erro ao atualizar Slot no banco: %w", err)
		}
	}
	return slot, nil
}

// DeleteSlot remove o Slot
func (s *NetworkService) DeleteSlot(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		if err := s.db.DeleteSlot(id); err != nil {
			return fmt.Errorf("erro ao excluir Slot no banco: %w", err)
		}
	}
	return nil
}

// CreatePon adiciona uma nova porta PON ao Slot
func (s *NetworkService) CreatePon(pon *models.NetworkPon) (*models.NetworkPon, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if pon.SlotID == "" {
		return nil, errors.New("o Slot pai é obrigatório para a PON")
	}
	if pon.OltID == "" {
		return nil, errors.New("a OLT é obrigatória para a PON")
	}
	name := strings.TrimSpace(pon.Name)
	if name == "" {
		pon.Name = fmt.Sprintf("PON %d", pon.PonNumber)
	}

	if pon.ID == "" {
		pon.ID = "pon-" + uuid.New().String()[:8]
	}
	pon.CreatedAt = time.Now().UTC()
	pon.Ctos = make([]*models.NetworkCto, 0)

	if s.db != nil {
		if err := s.db.CreatePon(pon); err != nil {
			return nil, fmt.Errorf("erro ao salvar PON no banco: %w", err)
		}
	}

	return pon, nil
}

// UpdatePon atualiza dados da porta PON
func (s *NetworkService) UpdatePon(id string, pon *models.NetworkPon) (*models.NetworkPon, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	pon.ID = id
	if s.db != nil {
		if err := s.db.UpdatePon(pon); err != nil {
			return nil, fmt.Errorf("erro ao atualizar PON no banco: %w", err)
		}
	}
	return pon, nil
}

// DeletePon remove uma porta PON
func (s *NetworkService) DeletePon(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		if err := s.db.DeletePon(id); err != nil {
			return fmt.Errorf("erro ao excluir PON no banco: %w", err)
		}
	}
	return nil
}

// CreateCto adiciona uma nova CTO à porta PON (autoresolve slot_id e olt_id a partir da PON)
func (s *NetworkService) CreateCto(cto *models.NetworkCto) (*models.NetworkCto, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if cto.PonID == "" {
		return nil, errors.New("a porta PON é obrigatória para a CTO")
	}
	name := strings.TrimSpace(cto.Name)
	if name == "" {
		return nil, errors.New("o nome da CTO é obrigatório")
	}

	if cto.SlotID == "" || cto.OltID == "" {
		if s.db != nil {
			if pon, err := s.db.GetPon(cto.PonID); err == nil && pon != nil {
				cto.SlotID = pon.SlotID
				cto.OltID = pon.OltID
			}
		}
	}

	if cto.ID == "" {
		cto.ID = "cto-" + uuid.New().String()[:8]
	}
	cto.Name = strings.ToUpper(name)
	if cto.SplitterRatio == "" {
		cto.SplitterRatio = "1:16"
	}
	if cto.TotalPorts <= 0 {
		cto.TotalPorts = 16
	}
	cto.CreatedAt = time.Now().UTC()

	if s.db != nil {
		if err := s.db.CreateCto(cto); err != nil {
			return nil, fmt.Errorf("erro ao salvar CTO no banco: %w", err)
		}
	}

	return cto, nil
}

// CreateCtosBatch cadastra 1 ou mais CTOs em lote vinculadas a uma única PON
func (s *NetworkService) CreateCtosBatch(req *models.CreateCtosBatchRequest) ([]*models.NetworkCto, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ponID := strings.TrimSpace(req.PonID)
	if ponID == "" {
		return nil, errors.New("a porta PON é obrigatória para cadastrar as CTOs")
	}

	var slotID, oltID string
	if s.db != nil {
		pon, err := s.db.GetPon(ponID)
		if err != nil {
			return nil, fmt.Errorf("porta PON não encontrada: %w", err)
		}
		slotID = pon.SlotID
		oltID = pon.OltID
	}

	ratio := strings.TrimSpace(req.SplitterRatio)
	if ratio == "" {
		ratio = "1:16"
	}
	ports := req.TotalPorts
	if ports <= 0 {
		ports = 16
	}

	// Extrai a lista de nomes das CTOs a serem cadastradas
	names := make([]string, 0)
	if len(req.Names) > 0 {
		for _, n := range req.Names {
			trimmed := strings.ToUpper(strings.TrimSpace(n))
			if trimmed != "" {
				names = append(names, trimmed)
			}
		}
	} else if req.Count > 0 {
		prefix := strings.ToUpper(strings.TrimSpace(req.Prefix))
		if prefix == "" {
			prefix = "CTO-"
		}
		start := req.StartIndex
		if start <= 0 {
			start = 1
		}
		for i := 0; i < req.Count; i++ {
			num := start + i
			names = append(names, fmt.Sprintf("%s%02d", prefix, num))
		}
	}

	if len(names) == 0 {
		return nil, errors.New("nenhum nome ou quantidade de CTOs informada para cadastro")
	}

	now := time.Now().UTC()
	ctos := make([]*models.NetworkCto, 0, len(names))
	for _, n := range names {
		c := &models.NetworkCto{
			ID:            "cto-" + uuid.New().String()[:8],
			PonID:         ponID,
			SlotID:        slotID,
			OltID:         oltID,
			Name:          n,
			SplitterRatio: ratio,
			TotalPorts:    ports,
			Address:       strings.TrimSpace(req.Address),
			Coordinates:   strings.TrimSpace(req.Coordinates),
			Notes:         strings.TrimSpace(req.Notes),
			CreatedAt:     now,
		}
		ctos = append(ctos, c)
	}

	if s.db != nil {
		if err := s.db.CreateCtosBatch(ctos); err != nil {
			return nil, fmt.Errorf("erro ao salvar lote de CTOs no banco: %w", err)
		}
	}

	return ctos, nil
}

// UpdateCto atualiza dados de uma CTO
func (s *NetworkService) UpdateCto(id string, cto *models.NetworkCto) (*models.NetworkCto, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cto.ID = id
	cto.Name = strings.ToUpper(strings.TrimSpace(cto.Name))
	if s.db != nil {
		if err := s.db.UpdateCto(cto); err != nil {
			return nil, fmt.Errorf("erro ao atualizar CTO no banco: %w", err)
		}
	}
	return cto, nil
}

// DeleteCto remove uma CTO
func (s *NetworkService) DeleteCto(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db != nil {
		if err := s.db.DeleteCto(id); err != nil {
			return fmt.Errorf("erro ao excluir CTO no banco: %w", err)
		}
	}
	return nil
}
