package routing

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"st-core/internal/configuration"
)

func TestBundledRulesWhenFirstDownloadFails(t *testing.T) {
	cfg := configuration.RoutingConfig{
		Mode: "rule", RuleListURL: gfwListMirrors[0],
		RuleListCache: filepath.Join(t.TempDir(), "missing.cache"),
		Rules:         []string{"||custom.example"},
	}
	policy, err := Load(context.Background(), cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, domain := range []string{"discord.com", "github.com", "google.com", "custom.example"} {
		if !policy.ShouldHandle(domain) {
			t.Errorf("fallback should handle %s", domain)
		}
	}
	if policy.ShouldHandle("unlisted.example") {
		t.Error("fallback should not route unrelated domains")
	}
}

func TestCustomRuleListDoesNotUseBundledFallback(t *testing.T) {
	cfg := configuration.RoutingConfig{
		Mode: "rule", RuleListURL: "https://example.com/custom.txt",
		RuleListCache: filepath.Join(t.TempDir(), "missing.cache"),
	}
	_, err := Load(context.Background(), cfg, nil)
	if err == nil || !strings.Contains(err.Error(), "load routing rules") {
		t.Fatalf("expected the custom rule-list failure, got %v", err)
	}
}
