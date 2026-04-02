package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCreateBackupAndRestore(t *testing.T) {
	app := NewApp()
	tempDir := t.TempDir()
	targetPath := filepath.Join(tempDir, "en.json")
	originalContent := []byte("{\n  \"HOME\": {\n    \"TITLE\": \"Hello\"\n  }\n}\n")

	if err := os.WriteFile(targetPath, originalContent, 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	backupPath, err := app.CreateBackupFile(targetPath)
	if err != nil {
		t.Fatalf("expected backup creation to succeed, got %v", err)
	}

	changedContent := []byte("{\n  \"HOME\": {\n    \"TITLE\": \"Bonjour\"\n  }\n}\n")
	if err := os.WriteFile(targetPath, changedContent, 0644); err != nil {
		t.Fatalf("failed to mutate test file: %v", err)
	}

	if err := app.RestoreFileFromBackup(targetPath, backupPath); err != nil {
		t.Fatalf("expected restore to succeed, got %v", err)
	}

	finalContent, err := os.ReadFile(targetPath)
	if err != nil {
		t.Fatalf("failed to read restored file: %v", err)
	}

	if string(finalContent) != string(originalContent) {
		t.Fatalf("restored content mismatch\nwant:\n%s\n\ngot:\n%s", string(originalContent), string(finalContent))
	}

	if _, err := os.Stat(backupPath); !os.IsNotExist(err) {
		t.Fatalf("expected backup file to be moved away after restore")
	}
}
