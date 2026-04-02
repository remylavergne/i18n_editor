package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"sort"
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

type StandardizedDiffAction string

const (
	DiffActionAdd    StandardizedDiffAction = "add"
	DiffActionChange StandardizedDiffAction = "change"
	DiffActionDelete StandardizedDiffAction = "delete"
)

type StandardizedDiffChange struct {
	Action   StandardizedDiffAction `json:"action"`
	Path     string                 `json:"path"`
	Segments []string               `json:"segments,omitempty"`
	Key      string                 `json:"key"`
	OldValue string                 `json:"oldValue,omitempty"`
	NewValue string                 `json:"newValue,omitempty"`
	Source   DiffChangeSource       `json:"source"`
}

type DiffChangeSource struct {
	File string `json:"file,omitempty"`
	Hunk string `json:"hunk,omitempty"`
	Line int    `json:"line"`
}

func extractLeafKey(path string) string {
	parts := splitPath(path)
	if len(parts) == 0 {
		return path
	}
	return parts[len(parts)-1]
}

func splitPath(path string) []string {
	if path == "" {
		return nil
	}
	return strings.Split(path, ".")
}

func parseDiffValue(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimSuffix(raw, ",")

	var s string
	if err := json.Unmarshal([]byte(raw), &s); err == nil {
		return s
	}

	var v interface{}
	if err := json.Unmarshal([]byte(raw), &v); err == nil {
		if v == nil {
			return ""
		}
		return fmt.Sprint(v)
	}

	return strings.Trim(raw, "\"")
}

type diffSideEntry struct {
	Path  string
	Value string
	Line  int
	File  string
	Hunk  string
}

var diffObjectStartRe = regexp.MustCompile(`^\s*"([^"]+)"\s*:\s*{\s*,?\s*$`)
var diffKeyValueRe = regexp.MustCompile(`^\s*"([^"]+)"\s*:\s*(.+?)\s*,?\s*$`)

func isDiffMetadataLine(line string) bool {
	return strings.HasPrefix(line, "diff --") ||
		strings.HasPrefix(line, "index ") ||
		strings.HasPrefix(line, "@@") ||
		strings.HasPrefix(line, "+++") ||
		strings.HasPrefix(line, "---") ||
		strings.HasPrefix(line, "new file mode") ||
		strings.HasPrefix(line, "deleted file mode")
}

func splitDiffPrefix(line string) (prefix byte, content string, ok bool) {
	if line == "" {
		return 0, "", false
	}

	prefix = line[0]
	if prefix != ' ' && prefix != '+' && prefix != '-' {
		return 0, "", false
	}

	return prefix, line[1:], true
}

func updatePathStackFromLine(content string, pathStack *[]string) {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		return
	}

	if strings.HasPrefix(trimmed, "}") {
		if len(*pathStack) > 0 {
			*pathStack = (*pathStack)[:len(*pathStack)-1]
		}
		return
	}

	if m := diffObjectStartRe.FindStringSubmatch(content); m != nil {
		*pathStack = append(*pathStack, m[1])
	}
}

func extractChangedValueFromLine(content string, pathStack []string) (path string, value string, ok bool) {
	matches := diffKeyValueRe.FindStringSubmatch(content)
	if matches == nil {
		return "", "", false
	}

	key := matches[1]
	rawValue := strings.TrimSpace(matches[2])
	if strings.HasPrefix(rawValue, "{") {
		return "", "", false
	}

	parts := append(append([]string{}, pathStack...), key)
	return strings.Join(parts, "."), parseDiffValue(rawValue), true
}

func extractDiffSideEntries(diffContent string, side byte) map[string]diffSideEntry {
	entries := make(map[string]diffSideEntry)
	pathStack := make([]string, 0)
	lines := strings.Split(diffContent, "\n")
	currentFile := ""
	currentHunk := ""

	for idx, rawLine := range lines {
		line := strings.TrimRight(rawLine, "\r")

		if side == '+' && strings.HasPrefix(line, "+++ ") {
			currentFile = strings.TrimPrefix(line, "+++ ")
			currentFile = strings.TrimPrefix(currentFile, "b/")
			continue
		}

		if side == '-' && strings.HasPrefix(line, "--- ") {
			currentFile = strings.TrimPrefix(line, "--- ")
			currentFile = strings.TrimPrefix(currentFile, "a/")
			continue
		}

		if strings.HasPrefix(line, "@@") {
			currentHunk = line
			continue
		}

		if isDiffMetadataLine(line) {
			continue
		}

		prefix, content, ok := splitDiffPrefix(line)
		if !ok {
			continue
		}

		if prefix != ' ' && prefix != side {
			continue
		}

		updatePathStackFromLine(content, &pathStack)

		if prefix != side {
			continue
		}

		path, value, valueOK := extractChangedValueFromLine(content, pathStack)
		if !valueOK {
			continue
		}

		entries[path] = diffSideEntry{
			Path:  path,
			Value: value,
			Line:  idx + 1,
			File:  currentFile,
			Hunk:  currentHunk,
		}
	}

	return entries
}

func (a *App) ParseDiffToStandardChanges(diffContent string) ([]StandardizedDiffChange, error) {
	oldEntries := extractDiffSideEntries(diffContent, '-')
	newEntries := extractDiffSideEntries(diffContent, '+')
	changes := make([]StandardizedDiffChange, 0, len(oldEntries)+len(newEntries))

	for path, oldEntry := range oldEntries {
		if newEntry, exists := newEntries[path]; exists {
			changes = append(changes, StandardizedDiffChange{
				Action:   DiffActionChange,
				Path:     path,
				Segments: splitPath(path),
				Key:      extractLeafKey(path),
				OldValue: oldEntry.Value,
				NewValue: newEntry.Value,
				Source: DiffChangeSource{
					File: newEntry.File,
					Hunk: newEntry.Hunk,
					Line: newEntry.Line,
				},
			})
			continue
		}

		changes = append(changes, StandardizedDiffChange{
			Action:   DiffActionDelete,
			Path:     path,
			Segments: splitPath(path),
			Key:      extractLeafKey(path),
			OldValue: oldEntry.Value,
			Source: DiffChangeSource{
				File: oldEntry.File,
				Hunk: oldEntry.Hunk,
				Line: oldEntry.Line,
			},
		})
	}

	for path, newEntry := range newEntries {
		if _, exists := oldEntries[path]; exists {
			continue
		}

		changes = append(changes, StandardizedDiffChange{
			Action:   DiffActionAdd,
			Path:     path,
			Segments: splitPath(path),
			Key:      extractLeafKey(path),
			NewValue: newEntry.Value,
			Source: DiffChangeSource{
				File: newEntry.File,
				Hunk: newEntry.Hunk,
				Line: newEntry.Line,
			},
		})
	}

	sort.Slice(changes, func(i, j int) bool {
		if changes[i].Source.Line == changes[j].Source.Line {
			return changes[i].Path < changes[j].Path
		}
		return changes[i].Source.Line < changes[j].Source.Line
	})

	return changes, nil
}

func (a *App) ParseDiffFile(diffContent string) ([]DiffChange, error) {
	standardChanges, err := a.ParseDiffToStandardChanges(diffContent)
	if err != nil {
		return nil, err
	}

	changes := make([]DiffChange, 0, len(standardChanges))
	for _, change := range standardChanges {
		mapped := DiffChange{
			Key:  change.Path,
			Line: change.Source.Line,
		}

		switch change.Action {
		case DiffActionAdd:
			mapped.Type = "add"
			mapped.NewValue = change.NewValue
		case DiffActionDelete:
			mapped.Type = "delete"
			mapped.OldValue = change.OldValue
		case DiffActionChange:
			mapped.Type = "modify"
			mapped.OldValue = change.OldValue
			mapped.NewValue = change.NewValue
		default:
			continue
		}

		changes = append(changes, mapped)
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
