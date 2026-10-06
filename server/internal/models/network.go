package models

import "time"

// NetworkOlt representa uma Optical Line Terminal (OLT) na rede
type NetworkOlt struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Model       string         `json:"model,omitempty"`
	IP          string         `json:"ip,omitempty"`
	Location    string         `json:"location,omitempty"`
	Description string         `json:"description,omitempty"`
	SlotCount   int            `json:"slotCount,omitempty"`
	PonsPerSlot int            `json:"ponsPerSlot,omitempty"`
	Slots       []*NetworkSlot `json:"slots,omitempty"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

// NetworkSlot representa um slot de placa PON pertencente à OLT
type NetworkSlot struct {
	ID         string        `json:"id"`
	OltID      string        `json:"oltId"`
	SlotNumber int           `json:"slotNumber"`
	Name       string        `json:"name"`
	CardType   string        `json:"cardType,omitempty"`
	PonCount   int           `json:"ponCount,omitempty"`
	Pons       []*NetworkPon `json:"pons,omitempty"`
	CreatedAt  time.Time     `json:"createdAt"`
}

// NetworkPon representa uma porta PON pertencente ao Slot da OLT
type NetworkPon struct {
	ID        string        `json:"id"`
	SlotID    string        `json:"slotId"`
	OltID     string        `json:"oltId"`
	PonNumber int           `json:"ponNumber"`
	Name      string        `json:"name"`
	SfpType   string        `json:"sfpType,omitempty"`
	Ctos      []*NetworkCto `json:"ctos,omitempty"`
	CreatedAt time.Time     `json:"createdAt"`
}

// NetworkCto representa uma Caixa de Terminação Óptica (CTO) pertencente à PON
type NetworkCto struct {
	ID            string    `json:"id"`
	PonID         string    `json:"ponId"`
	SlotID        string    `json:"slotId"`
	OltID         string    `json:"oltId"`
	Name          string    `json:"name"`
	SplitterRatio string    `json:"splitterRatio,omitempty"`
	TotalPorts    int       `json:"totalPorts"`
	Address       string    `json:"address,omitempty"`
	Coordinates   string    `json:"coordinates,omitempty"`
	Notes         string    `json:"notes,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
}

// CreateCtosBatchRequest representa a requisição para cadastrar 1 ou mais CTOs vinculadas a uma PON
type CreateCtosBatchRequest struct {
	PonID         string   `json:"ponId"`
	Names         []string `json:"names,omitempty"`
	Prefix        string   `json:"prefix,omitempty"`
	StartIndex    int      `json:"startIndex,omitempty"`
	Count         int      `json:"count,omitempty"`
	SplitterRatio string   `json:"splitterRatio,omitempty"`
	TotalPorts    int      `json:"totalPorts,omitempty"`
	Address       string   `json:"address,omitempty"`
	Coordinates   string   `json:"coordinates,omitempty"`
	Notes         string   `json:"notes,omitempty"`
}
