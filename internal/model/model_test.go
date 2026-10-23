package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPromptReadsLegacyAtlasKeysAndWritesCurrentKeys(t *testing.T) {
	var prompt Prompt
	input := []byte(`{"id":"p1","name":"legacy","version":1,"sections":[],"status":"active","createdAt":"x","updatedAt":"x","mulch":{"prime":{"domains":["go"]}},"extends_mulch":true}`)
	if err := json.Unmarshal(input, &prompt); err != nil {
		t.Fatal(err)
	}
	if prompt.Atlas == nil || prompt.Atlas.Prime == nil || prompt.Atlas.Prime.Domains[0] != "go" || prompt.ExtendsAtlas == nil || !*prompt.ExtendsAtlas {
		t.Fatalf("legacy keys not normalized: %#v", prompt)
	}
	encoded, err := json.Marshal(prompt)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"atlas"`) || strings.Contains(string(encoded), `"mulch"`) {
		t.Fatalf("current serialization wrong: %s", encoded)
	}
}
