package config

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"gopkg.in/yaml.v3"
)

// top-level configuration
type Config struct {
	DeleteSourceBranchOnMerge bool      `yaml:"delete_source_branch_on_merge,omitempty"`
	ParallelPlan              bool      `yaml:"parallel_plan,omitempty"`
	ParallelApply             bool      `yaml:"parallel_apply,omitempty"`
	AbortOnExecutionOrderFail bool      `yaml:"abort_on_execution_order_fail,omitempty"`
	Projects                  []Project `yaml:"projects,omitempty"`
}

// Project represents a single Terraform project configuration
type Project struct {
	Name                      string    `yaml:"name,omitempty"`
	Branch                    string    `yaml:"branch,omitempty"`
	Dir                       string    `yaml:"dir"`
	DeleteSourceBranchOnMerge bool      `yaml:"delete_source_branch_on_merge,omitempty"`
	Autoplan                  *Autoplan `yaml:"autoplan,omitempty"`
	PlanRequirements          []string  `yaml:"plan_requirements,omitempty"`
	ApplyRequirements         []string  `yaml:"apply_requirements,omitempty"`
	ImportRequirements        []string  `yaml:"import_requirements,omitempty"`
	Workflow                  string    `yaml:"workflow,omitempty"`
}

// Autoplan defines when to automatically run plan
type Autoplan struct {
	WhenModified []string `yaml:"when_modified,omitempty"`
	Enabled      bool     `yaml:"enabled"`
}

// LoadConfig loads an Atlantis configuration file
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &config, nil
}

// FindProjectsForPath returns all projects that match the given file path
func (c *Config) FindProjectsForPath(filePath, branch string) []Project {
	var matchedProjects []Project

	for _, project := range c.Projects {
		// Check branch filter
		if project.Branch != "" {
			matched, err := regexp.MatchString(project.Branch, branch)
			if err != nil || !matched {
				continue
			}
		}

		// Check if file is in project directory
		projectDir := project.Dir
		if projectDir == "" {
			projectDir = "."
		}

		relPath, err := filepath.Rel(projectDir, filePath)
		if err != nil || len(relPath) > 0 && relPath[0] == '.' {
			// File is not under project directory
			continue
		}

		matchedProjects = append(matchedProjects, project)
	}

	return matchedProjects
}

// ValidateRequirements checks if all requirements are met for an operation
func (project *Project) ValidateRequirements(reqType string, pullRequest *PullRequestInfo) error {
	var requirements []string

	switch reqType {
	case "plan":
		requirements = project.PlanRequirements
	case "apply":
		requirements = project.ApplyRequirements
	case "import":
		requirements = project.ImportRequirements
	default:
		return fmt.Errorf("unknown requirement type: %s", reqType)
	}

	for _, req := range requirements {
		switch req {
		case "mergeable":
			if !pullRequest.Mergeable {
				return fmt.Errorf("pull request is not mergeable")
			}
		case "approved":
			if !pullRequest.Approved {
				return fmt.Errorf("pull request is not approved")
			}
		case "undiverged":
			if pullRequest.Diverged {
				return fmt.Errorf("pull request branch has diverged from base")
			}
		default:
			return fmt.Errorf("unknown requirement: %s", req)
		}
	}

	return nil
}

// PullRequestInfo contains information about a pull request
type PullRequestInfo struct {
	Mergeable bool
	Approved  bool
	Diverged  bool
}
