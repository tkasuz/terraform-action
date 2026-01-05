package terraform

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/tkasuz/terraform-action/pkg/config"
)

// Executor handles Terraform command execution
type Executor struct {
	workDir     string
	githubToken string
	owner       string
	repo        string
	prNumber    int
}

// NewExecutor creates a new Terraform executor
func NewExecutor(workDir, githubToken, owner, repo string, prNumber int) *Executor {
	return &Executor{
		workDir:     workDir,
		githubToken: githubToken,
		owner:       owner,
		repo:        repo,
		prNumber:    prNumber,
	}
}

// ExecuteWorkflow executes a workflow (plan or apply)
func (e *Executor) Execute(ctx context.Context, command string, project *config.Project, args []string) error {
	projectDir := filepath.Join(e.workDir, project.Dir)

	if err := e.Init(ctx, projectDir, []string{}); err != nil {
		return err
	}
	switch command {
	case "plan":
		return e.Plan(ctx, projectDir, args)

	case "apply":
		return e.Apply(ctx, projectDir, args)

	case "import":
		return e.Import(ctx, projectDir, args)

	default:
		return fmt.Errorf("unknown command: %s", command)
	}
}

// Init runs terraform init
func (e *Executor) Init(ctx context.Context, projectDir string, extraArgs []string) error {
	args := []string{"init", "-input=false"}
	args = append(args, extraArgs...)

	return e.runTerraformCommand(ctx, projectDir, args)
}

// Plan runs terraform plan with tfcmt
func (e *Executor) Plan(ctx context.Context, projectDir string, extraArgs []string) error {
	args := []string{"plan", "-input=false", "-no-color"}
	args = append(args, extraArgs...)

	return e.runTerraformCommand(ctx, projectDir, args)
}

// Apply runs terraform apply with tfcmt
func (e *Executor) Apply(ctx context.Context, projectDir string, extraArgs []string) error {
	args := []string{"apply", "-input=false", "-no-color", "-auto-approve"}
	args = append(args, extraArgs...)

	return e.runTerraformCommand(ctx, projectDir, args)
}

// Import runs terraform import
func (e *Executor) Import(ctx context.Context, projectDir string, extraArgs []string) error {
	args := []string{"import", "-input=false", "-no-color"}
	args = append(args, extraArgs...)

	return e.runTerraformCommand(ctx, projectDir, args)
}

// runTerraformCommand runs a terraform command directly
func (e *Executor) runTerraformCommand(ctx context.Context, projectDir string, args []string) error {
	cmd := exec.CommandContext(ctx, "terraform", args...)
	cmd.Dir = projectDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("terraform command failed: %w", err)
	}

	return nil
}
