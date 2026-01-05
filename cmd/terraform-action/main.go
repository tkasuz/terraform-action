package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/tkasuz/terraform-action/pkg/config"
	ghclient "github.com/tkasuz/terraform-action/pkg/github"
	"github.com/tkasuz/terraform-action/pkg/terraform"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("Error: %v", err)
	}
}

func run() error {
	ctx := context.Background()

	// Get environment variables
	githubToken := os.Getenv("GITHUB_TOKEN")
	if githubToken == "" {
		return fmt.Errorf("GITHUB_TOKEN environment variable is required")
	}

	eventPath := os.Getenv("GITHUB_EVENT_PATH")
	if eventPath == "" {
		return fmt.Errorf("GITHUB_EVENT_PATH environment variable is required")
	}

	workspaceDir := os.Getenv("GITHUB_WORKSPACE")
	if workspaceDir == "" {
		workspaceDir = "."
	}

	configPath := os.Getenv("TERRAFORM_ACTION_CONFIG_PATH")
	if configPath == "" {
		configPath = filepath.Join(workspaceDir, "terraform-action.yaml")
	}

	// Read the event payload
	eventData, err := os.ReadFile(eventPath)
	if err != nil {
		return fmt.Errorf("failed to read event file: %w", err)
	}

	// Create GitHub client
	client := ghclient.NewClient(ctx, githubToken)

	// Parse the comment event
	event, err := client.ParseCommentEvent(eventData)
	if err != nil {
		return fmt.Errorf("failed to parse comment event: %w", err)
	}

	// Parse the command from the comment
	command, projectFilter, args := ghclient.ParseCommand(event.Comment)
	if command == "" {
		return nil
	}

	// Load configuration
	cfg, err := loadConfig(configPath)
	if err != nil {
		log.Printf("Warning: failed to load config from %s: %v", configPath, err)
		// Use default config
		cfg = &config.Config{
			Projects: []config.Project{
				{
					Dir: ".",
				},
			},
		}
	}

	// Get changed files
	changedFiles, err := client.GetChangedFiles(event.Owner, event.Repo, event.PRNumber)
	if err != nil {
		return fmt.Errorf("failed to get changed files: %w", err)
	}

	// Filter projects
	projects := filterProjects(cfg, projectFilter, changedFiles, event.HeadBranch)

	if len(projects) == 0 {
		msg := "No projects matched the criteria"
		if err := client.PostComment(event.Owner, event.Repo, event.PRNumber, msg); err != nil {
			log.Printf("Failed to post comment: %v", err)
		}
		return nil
	}

	// Get PR info for requirements validation
	prInfo, err := client.GetPRInfo(event.Owner, event.Repo, event.PRNumber)
	if err != nil {
		return fmt.Errorf("failed to get PR info: %w", err)
	}

	for _, project := range projects {
		prInfoConfig := &config.PullRequestInfo{
			Mergeable: prInfo.Mergeable,
			Approved:  prInfo.Approved,
			Diverged:  prInfo.Diverged,
		}

		if err := project.ValidateRequirements(command, prInfoConfig); err != nil {
			log.Printf("❌ Project `%s`: Requirements not met: %v", project.Name, err)
			continue
		}

		// Create executor
		executor := terraform.NewExecutor(
			workspaceDir,
			githubToken,
			event.Owner,
			event.Repo,
			event.PRNumber,
		)

		// Execute the command
		if err := executor.Execute(ctx, command, &project, args); err != nil {
			log.Printf("❌ Project `%s`: %v", project.Name, err)
			return err
		}
	}

	return nil
}

// loadConfig loads the Atlantis configuration file
func loadConfig(path string) (*config.Config, error) {
	// Try .yaml extension
	if _, err := os.Stat(path); err == nil {
		return config.LoadConfig(path)
	}

	// Try .yml extension
	altPath := strings.TrimSuffix(path, ".yaml") + ".yml"
	if _, err := os.Stat(altPath); err == nil {
		return config.LoadConfig(altPath)
	}

	return nil, fmt.Errorf("config file not found: %s", path)
}

// filterProjects filters projects based on command and changed files
func filterProjects(cfg *config.Config, projectFilter string, changedFiles []string, branch string) []config.Project {
	var filtered []config.Project

	for _, project := range cfg.Projects {
		// Filter by project name if specified
		if projectFilter != "" {
			if project.Name != projectFilter && project.Dir != projectFilter {
				continue
			}
		}

		// Filter by branch
		if project.Branch != "" {
			// Branch is a regex pattern
			matched := matchBranch(branch, project.Branch)
			if !matched {
				continue
			}
		}

		// Filter by changed files
		if len(changedFiles) > 0 {
			hasChanges := false
			for _, file := range changedFiles {
				if strings.HasPrefix(file, project.Dir) {
					hasChanges = true
					break
				}
			}

			if !hasChanges {
				continue
			}
		}

		filtered = append(filtered, project)
	}

	return filtered
}

// matchBranch checks if a branch matches a pattern (simple implementation)
func matchBranch(branch, pattern string) bool {
	// Remove leading/trailing slashes from pattern
	pattern = strings.Trim(pattern, "/")

	// Simple wildcard matching
	if pattern == "*" {
		return true
	}

	return strings.Contains(branch, pattern)
}
