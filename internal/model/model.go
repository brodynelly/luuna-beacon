package model

import "encoding/json"

const (
	LockStaleMS     = 30_000
	LockRetryMS     = 50
	LockTimeoutMS   = 5_000
	MaxInheritDepth = 5
)

type Section struct {
	Name     string `json:"name"`
	Body     string `json:"body"`
	Required *bool  `json:"required,omitempty"`
}

type AtlasPrime struct {
	Domains []string `json:"domains,omitempty"`
	Files   []string `json:"files,omitempty"`
}

type Atlas struct {
	Prime   *AtlasPrime `json:"prime,omitempty"`
	Budget  *float64    `json:"budget,omitempty"`
	OnEmpty string      `json:"on_empty,omitempty"`
}

type Prompt struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Description  string         `json:"description,omitempty"`
	Version      int            `json:"version"`
	Sections     []Section      `json:"sections"`
	Extends      string         `json:"extends,omitempty"`
	Mixins       []string       `json:"mixins,omitempty"`
	Tags         []string       `json:"tags,omitempty"`
	Schema       string         `json:"schema,omitempty"`
	EmitAs       string         `json:"emitAs,omitempty"`
	EmitDir      string         `json:"emitDir,omitempty"`
	Pinned       *int           `json:"pinned,omitempty"`
	Frontmatter  map[string]any `json:"frontmatter,omitempty"`
	Atlas        *Atlas         `json:"atlas,omitempty"`
	ExtendsAtlas *bool          `json:"extends_atlas,omitempty"`
	Status       string         `json:"status"`
	CreatedAt    string         `json:"createdAt"`
	UpdatedAt    string         `json:"updatedAt"`
}

// UnmarshalJSON retains compatibility with pre-Atlas records.  The legacy
// names are accepted only on read; ordinary Go serialization writes the
// current atlas/extends_atlas contract on the next append.
func (prompt *Prompt) UnmarshalJSON(data []byte) error {
	type plain Prompt
	var decoded plain
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if decoded.Atlas == nil {
		if legacy, ok := raw["mulch"]; ok {
			var atlas Atlas
			if err := json.Unmarshal(legacy, &atlas); err != nil {
				return err
			}
			decoded.Atlas = &atlas
		}
	}
	if decoded.ExtendsAtlas == nil {
		if legacy, ok := raw["extends_mulch"]; ok {
			var enabled bool
			if err := json.Unmarshal(legacy, &enabled); err != nil {
				return err
			}
			decoded.ExtendsAtlas = &enabled
		}
	}
	*prompt = Prompt(decoded)
	return nil
}

type Rule struct {
	Section string `json:"section"`
	Pattern string `json:"pattern"`
	Message string `json:"message"`
}

type Schema struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	RequiredSections []string `json:"requiredSections"`
	OptionalSections []string `json:"optionalSections,omitempty"`
	Rules            []Rule   `json:"rules,omitempty"`
	CreatedAt        string   `json:"createdAt"`
	UpdatedAt        string   `json:"updatedAt"`
}

type EmitTarget struct {
	Dir     string   `yaml:"dir" json:"dir"`
	Default bool     `yaml:"default,omitempty" json:"default,omitempty"`
	Tags    []string `yaml:"tags,omitempty" json:"tags,omitempty"`
}

type Config struct {
	Project string                `yaml:"project" json:"project"`
	Version string                `yaml:"version" json:"version"`
	Targets map[string]EmitTarget `yaml:"targets,omitempty" json:"targets,omitempty"`
}

type ArtifactFile struct {
	Path       string `json:"path"`
	Encoding   string `json:"encoding"`
	Content    string `json:"content"`
	SHA256     string `json:"sha256"`
	Executable bool   `json:"executable"`
}

type Artifact struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	Name      string         `json:"name"`
	Version   int            `json:"version"`
	Files     []ArtifactFile `json:"files"`
	SHA256    string         `json:"sha256"`
	CreatedAt string         `json:"createdAt"`
}
