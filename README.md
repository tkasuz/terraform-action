# Terraform GitHub Action

A GitHub Action that runs Terraform commands from PR comments, similar to Atlantis, using [tfcmt](https://github.com/suzuki-shunsuke/tfcmt) for formatted output and [go-github](https://github.com/google/go-github) for GitHub API interactions.

## Features

- 🚀 **Atlantis-compatible configuration** - Uses the same `atlantis.yaml` configuration format
- 💬 **Comment-driven workflows** - Trigger `plan` and `apply` from PR comments
- 📊 **Beautiful output formatting** - Uses tfcmt to format Terraform output in PR comments
- 🔍 **Auto-discovery** - Automatically discovers Terraform projects in your repository
- 🔐 **Requirements validation** - Enforce approvals, mergeability, and other requirements
- 🔄 **Custom workflows** - Define custom execution steps for plan and apply
- 🌳 **Multi-project support** - Handle multiple Terraform projects in one repository
- 🎯 **Workspace support** - Full Terraform workspace support

## Quick Start

### 1. Add the workflow to your repository

Create `.github/workflows/terraform-pr.yml`:

```yaml
name: Terraform PR Actions

on:
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  terraform:
    if: github.event.issue.pull_request && (startsWith(github.event.comment.body, 'terraform') || startsWith(github.event.comment.body, 'atlantis'))
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          ref: refs/pull/${{ github.event.issue.number }}/head

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.7.0

      - name: Install tfcmt
        run: |
          curl -L https://github.com/suzuki-shunsuke/tfcmt/releases/download/v4.11.0/tfcmt_linux_amd64.tar.gz | tar xz
          sudo mv tfcmt /usr/local/bin/
          sudo chmod +x /usr/local/bin/tfcmt

      - name: Build and run
        run: |
          go build -o terraform-action ./cmd/terraform-action
          ./terraform-action
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ATLANTIS_CONFIG_PATH: ${{ github.workspace }}/atlantis.yaml
```

### 2. Create `atlantis.yaml` configuration

```yaml
version: 3
automerge: false
autodiscover:
  mode: auto
  ignore_paths:
    - .github
    - docs

projects:
  - name: production
    dir: terraform/production
    workspace: default
    terraform_version: v1.7.0
    autoplan:
      when_modified: ["*.tf", ".terraform.lock.hcl"]
      enabled: true
    plan_requirements: [mergeable]
    apply_requirements: [mergeable, approved]
```

### 3. Use in Pull Requests

Comment on your PR with:
- `terraform plan` - Run plan for all affected projects
- `terraform apply` - Run apply for all affected projects
- `terraform plan -d terraform/production` - Run plan for specific directory
- `terraform plan -p production` - Run plan for specific project name

## Configuration

The action uses an `atlantis.yaml` configuration file compatible with [Atlantis](https://www.runatlantis.io/docs/repo-level-atlantis-yaml.html).

### Top-Level Configuration

```yaml
version: 3                              # Required: Config version
automerge: true                         # Auto-merge PR after successful apply
autodiscover:                           # Auto-discover Terraform projects
  mode: auto
  ignore_paths:
    - some/path
delete_source_branch_on_merge: true    # Delete branch after merge
parallel_plan: true                     # Run plans in parallel
parallel_apply: true                    # Run applies in parallel
```

### Project Configuration

```yaml
projects:
  - name: my-project-name
    branch: /main/                      # Regex pattern for branch matching
    dir: .                              # Directory containing Terraform files
    workspace: default                  # Terraform workspace
    terraform_version: v1.7.0          # Terraform version to use

    autoplan:                           # Automatic plan trigger
      when_modified: ["*.tf", "*.tfvars"]
      enabled: true

    plan_requirements:                  # Requirements before plan
      - mergeable

    apply_requirements:                 # Requirements before apply
      - mergeable
      - approved
      - undiverged

    workflow: custom                    # Custom workflow name
```

### Custom Workflows

Define custom execution steps:

```yaml
workflows:
  custom:
    plan:
      steps:
        - run: echo "Pre-plan hook"
        - init
        - plan:
            extra_args: ["-lock=false"]
        - run:
            command: terraform show -json plan.tfplan
            output: hide
    apply:
      steps:
        - init
        - apply
        - run: echo "Post-apply hook"
```

### Requirements

Available requirement types:
- `mergeable` - PR must be mergeable (no conflicts)
- `approved` - PR must have at least one approval
- `undiverged` - PR branch must not be behind base branch

## Commands

### terraform plan

Runs `terraform plan` and posts the output to the PR.

```
terraform plan
terraform plan -d path/to/terraform
terraform plan -p project-name
```

### terraform apply

Runs `terraform apply` and posts the output to the PR.

```
terraform apply
terraform apply -d path/to/terraform
terraform apply -p project-name
```

### terraform help

Shows available commands.

```
terraform help
```

## Environment Variables

- `GITHUB_TOKEN` (required) - GitHub token for API access
- `ATLANTIS_CONFIG_PATH` (optional) - Path to atlantis.yaml (default: `./atlantis.yaml`)
- `TERRAFORM_BINARY` (optional) - Path to terraform binary (default: `terraform`)
- `TFCMT_BINARY` (optional) - Path to tfcmt binary (default: `tfcmt`)

## Examples

### Basic Single Project

```yaml
version: 3
projects:
  - dir: .
    workspace: default
    apply_requirements: [approved]
```

### Multi-Environment Setup

```yaml
version: 3
projects:
  - name: dev
    dir: terraform/dev
    workspace: default
    branch: /develop/

  - name: staging
    dir: terraform/staging
    workspace: default
    branch: /main/
    apply_requirements: [approved]

  - name: production
    dir: terraform/production
    workspace: default
    branch: /main/
    apply_requirements: [approved, mergeable]
```

### Auto-Discovery with Custom Workflow

```yaml
version: 3
autodiscover:
  mode: auto
  ignore_paths:
    - examples
    - tests

workflows:
  validation:
    plan:
      steps:
        - run: terraform fmt -check
        - init
        - run: terraform validate
        - plan

projects:
  - workflow: validation
    apply_requirements: [approved, mergeable, undiverged]
```

## Development

### Building

```bash
go build -o terraform-action ./cmd/terraform-action
```

### Testing Locally

```bash
export GITHUB_TOKEN=your_token
export GITHUB_EVENT_PATH=/path/to/event.json
export GITHUB_WORKSPACE=/path/to/repo
./terraform-action
```

### Docker Build

```bash
docker build -t terraform-action .
docker run -e GITHUB_TOKEN=$GITHUB_TOKEN terraform-action
```

## Comparison with Atlantis

| Feature | This Action | Atlantis |
|---------|------------|----------|
| Deployment | GitHub Actions | Standalone server |
| Configuration | atlantis.yaml | atlantis.yaml |
| Comment triggers | ✅ | ✅ |
| Auto-planning | ✅ | ✅ |
| Custom workflows | ✅ | ✅ |
| Locking | ❌ | ✅ |
| State management | GitHub Actions | Built-in |
| Setup complexity | Low | Medium |

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or PR.
