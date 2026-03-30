package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
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
