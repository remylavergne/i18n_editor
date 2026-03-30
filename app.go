package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

func (a *App) OpenFileDialog(title, filterName, filterPattern string) (string, error) {
	result, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{
				DisplayName: filterName,
				Pattern:     filterPattern,
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to open file dialog: %w", err)
	}
	if result == "" {
		return "", nil
	}
	return result, nil
}

func (a *App) ReadTextFile(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}
	return string(data), nil
}

func (a *App) OpenDirectoryDialog(title string) (string, error) {
	result, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
	})
	if err != nil {
		return "", fmt.Errorf("failed to open directory dialog: %w", err)
	}
	if result == "" {
		return "", nil
	}
	return result, nil
}

func (a *App) SaveFileDialog(title, defaultName string) (string, error) {
	result, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "JSON Files",
				Pattern:     "*.json",
			},
		},
	})
	if err != nil {
		return "", fmt.Errorf("failed to open save dialog: %w", err)
	}
	if result == "" {
		return "", nil
	}
	return result, nil
}

func (a *App) SaveTextFile(filePath, content string) error {
	err := os.WriteFile(filePath, []byte(content), 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}
	return nil
}

func (a *App) GitDiff(sourceBranch, targetBranch, filePath string) (string, error) {
	cmd := exec.Command("git", "diff", sourceBranch, targetBranch, "--", filePath)
	output, err := cmd.Output()
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			return "", fmt.Errorf("git diff error: %s", string(exitError.Stderr))
		}
		return "", fmt.Errorf("failed to run git diff: %w", err)
	}
	return string(output), nil
}

func (a *App) GetWorkingDirectory() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("failed to get working directory: %w", err)
	}
	return wd, nil
}

func (a *App) SetWorkingDirectory(path string) error {
	_, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("directory does not exist: %w", err)
	}
	err = os.Chdir(path)
	if err != nil {
		return fmt.Errorf("failed to change directory: %w", err)
	}
	return nil
}

func (a *App) GitDiffBranches(repoPath, sourceBranch, targetBranch, filePath string) (string, error) {
	_, err := os.Stat(repoPath)
	if err != nil {
		return "", fmt.Errorf("repository path does not exist: %w", err)
	}

	args := []string{"diff", sourceBranch, targetBranch, "--", filePath}
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath

	output, err := cmd.Output()
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			stderr := string(exitError.Stderr)
			if strings.Contains(stderr, "fatal") {
				return "", fmt.Errorf("git error: %s", stderr)
			}
		}
		return "", fmt.Errorf("failed to run git diff: %w", err)
	}

	result := string(output)
	if result == "" {
		return "No differences found between the specified branches for this file.", nil
	}

	return result, nil
}

type DiffChange struct {
	Type     string `json:"type"`     // "add", "modify", "delete"
	Key      string `json:"key"`      // JSON key path like "app.title"
	OldValue string `json:"oldValue"` // Original value (for modify/delete)
	NewValue string `json:"newValue"` // New value (for add/modify)
	Line     int    `json:"line"`     // Line number in diff
}

func (a *App) ParseDiffFile(diffContent string) ([]DiffChange, error) {
	lines := strings.Split(diffContent, "\n")
	var changes []DiffChange

	reKey := regexp.MustCompile(`^\+\s*"([^"]+)":\s*"?([^",}]*)"?[,}]?\s*$`)
	reOldKey := regexp.MustCompile(`^-\s*"([^"]+)":\s*"?([^",}]*)"?[,}]?\s*$`)

	currentLine := 0
	for i, line := range lines {
		currentLine = i
		line = strings.TrimRight(line, "\r")

		if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") && !strings.HasPrefix(line, "++") {
			match := reKey.FindStringSubmatch(line)
			if match != nil && match[1] != "" {
				changes = append(changes, DiffChange{
					Type:     "add",
					Key:      match[1],
					NewValue: match[2],
					Line:     currentLine,
				})
			}
		} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") && !strings.HasPrefix(line, "diff --") {
			match := reOldKey.FindStringSubmatch(line)
			if match != nil && match[1] != "" {
				changes = append(changes, DiffChange{
					Type:     "delete",
					Key:      match[1],
					OldValue: match[2],
					Line:     currentLine,
				})
			}
		}
	}

	// Try to find modified lines (lines that are both deleted and added for the same key)
	if len(changes) > 0 {
		var finalChanges []DiffChange
		seen := make(map[string]bool)

		for i := 0; i < len(lines)-1; i++ {
			line := strings.TrimRight(lines[i], "\r")
			nextLine := strings.TrimRight(lines[i+1], "\r")

			oldMatch := reOldKey.FindStringSubmatch(line)
			newMatch := reKey.FindStringSubmatch(nextLine)

			if oldMatch != nil && newMatch != nil && oldMatch[1] == newMatch[1] && oldMatch[1] != "" {
				// This is a modification, not add/delete
				key := oldMatch[1]
				if !seen[key] {
					finalChanges = append(finalChanges, DiffChange{
						Type:     "modify",
						Key:      key,
						OldValue: oldMatch[2],
						NewValue: newMatch[2],
						Line:     i,
					})
					seen[key] = true
				}
				i++ // skip the next line since we processed it
			}
		}

		// Add any changes that weren't part of a modification
		for _, change := range changes {
			if !seen[change.Key] {
				finalChanges = append(finalChanges, change)
			}
		}

		changes = finalChanges
	}

	// Ensure we never return nil
	if changes == nil {
		changes = []DiffChange{}
	}

	return changes, nil
}

func (a *App) ReadJsonFile(filePath string) (map[string]interface{}, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return result, nil
}

func setNestedValue(m map[string]interface{}, key string, value interface{}) {
	keys := strings.Split(key, ".")
	current := m

	for i := 0; i < len(keys)-1; i++ {
		k := keys[i]
		if _, exists := current[k]; !exists {
			current[k] = make(map[string]interface{})
		}
		if nested, ok := current[k].(map[string]interface{}); ok {
			current = nested
		} else {
			current[k] = make(map[string]interface{})
			current = current[k].(map[string]interface{})
		}
	}

	lastKey := keys[len(keys)-1]
	if value == nil {
		delete(current, lastKey)
	} else {
		current[lastKey] = value
	}
}

func getNestedValue(m map[string]interface{}, key string) (interface{}, bool) {
	keys := strings.Split(key, ".")
	current := m

	for i := 0; i < len(keys)-1; i++ {
		k := keys[i]
		if nested, ok := current[k].(map[string]interface{}); ok {
			current = nested
		} else {
			return nil, false
		}
	}

	lastKey := keys[len(keys)-1]
	val, exists := current[lastKey]
	return val, exists
}

func (a *App) ApplyChangeToJson(filePath string, change DiffChange, overrideValue string) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	if err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	newValue := change.NewValue
	if overrideValue != "" {
		newValue = overrideValue
	}

	switch change.Type {
	case "add", "modify":
		setNestedValue(result, change.Key, newValue)
	case "delete":
		setNestedValue(result, change.Key, nil)
	}

	output, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	err = os.WriteFile(filePath, output, 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func (a *App) WriteJsonFile(filePath string, data map[string]interface{}) error {
	output, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	err = os.WriteFile(filePath, output, 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func (a *App) SaveAppliedChanges(baseFilePath string, changes []DiffChange, overrides map[string]string, outputFilePath string) error {
	data, err := os.ReadFile(baseFilePath)
	if err != nil {
		return fmt.Errorf("failed to read file: %w", err)
	}

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	if err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	for _, change := range changes {
		newValue := change.NewValue
		if override, exists := overrides[change.Key]; exists && override != "" {
			newValue = override
		}

		switch change.Type {
		case "add", "modify":
			setNestedValue(result, change.Key, newValue)
		case "delete":
			setNestedValue(result, change.Key, nil)
		}
	}

	output, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	err = os.WriteFile(outputFilePath, output, 0644)
	if err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func (a *App) GetAppliedChangesAsJson(baseFilePath string, changes []DiffChange, overrides map[string]string) (string, error) {
	data, err := os.ReadFile(baseFilePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	var result map[string]interface{}
	err = json.Unmarshal(data, &result)
	if err != nil {
		return "", fmt.Errorf("failed to parse JSON: %w", err)
	}

	for _, change := range changes {
		newValue := change.NewValue
		if override, exists := overrides[change.Key]; exists && override != "" {
			newValue = override
		}

		switch change.Type {
		case "add", "modify":
			setNestedValue(result, change.Key, newValue)
		case "delete":
			setNestedValue(result, change.Key, nil)
		}
	}

	output, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return string(output), nil
}

func (a *App) CheckAlreadyApplied(filePath string, changes []DiffChange) ([]bool, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var jsonData map[string]interface{}
	err = json.Unmarshal(data, &jsonData)
	if err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	results := make([]bool, len(changes))
	for i, change := range changes {
		currentValue, exists := getNestedValue(jsonData, change.Key)

		switch change.Type {
		case "add":
			if exists {
				results[i] = true
			}
		case "modify":
			if exists {
				currentStr, ok := currentValue.(string)
				if ok && currentStr == change.NewValue {
					results[i] = true
				}
			}
		case "delete":
			if !exists {
				results[i] = true
			}
		}
	}

	return results, nil
}
