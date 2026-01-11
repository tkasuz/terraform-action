# Terraform PR Comment Action

A production-ready GitHub Action for running Terraform plan/apply commands via PR comments, similar to Atlantis. Built with TypeScript and integrated with [tfcmt](https://github.com/suzuki-shunsuke/tfcmt) for formatted PR comments.

## Features

- **PR Comment Triggered**: Execute Terraform via `/terraform plan` or `/terraform apply` comments
- **Multi-Project Support**: Manage multiple Terraform projects in a single repository
- **Autoplan**: Automatically trigger plans when specified files are modified
- **Security First**: Blocks apply commands on forked PRs
- **Requirements Enforcement**: Validates mergeable status and approvals before execution
- **Serial Execution**: Processes projects sequentially for safe infrastructure changes
- **tfcmt Integration**: Posts beautifully formatted Terraform output as PR comments
- **TypeScript**: Clean, type-safe codebase with comprehensive error handling

## Usage

### Basic Setup

1. Create a workflow file (e.g., `.github/workflows/terraform-pr.yml`):

```yaml
name: Terraform PR

on:
  issue_comment:
    types: [created]

jobs:
  terraform:
    # Only run on PR comments
    if: github.event.issue.pull_request
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.6.0

      - name: Terraform PR Action
        uses: your-org/terraform-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          config-path: .terraform-action.yaml
```

2. Create a configuration file (`.terraform-action.yaml`):

```yaml
projects:
  - name: production
    dir: terraform/production
    autoplan:
      enabled: true
      when_modified: ["*.tf", "*.tfvars", ".terraform.lock.hcl"]
    plan_requirements: [mergeable]
    apply_requirements: [mergeable, approved]

  - name: staging
    dir: terraform/staging
    autoplan:
      enabled: true
      when_modified: ["*.tf", "*.tfvars"]
    plan_requirements: [mergeable]
    apply_requirements: [mergeable, approved]

tfcmt:
  enabled: true
  skip_no_changes: true
  ignore_warning: false
```

### Configuration Reference

#### Project Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique project name |
| `dir` | string | Yes | Directory containing Terraform files |
| `autoplan` | object | No | Autoplan configuration |
| `plan_requirements` | array | No | Requirements for plan (default: `[mergeable]`) |
| `apply_requirements` | array | No | Requirements for apply (default: `[mergeable, approved]`) |

#### Autoplan Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | Whether autoplan is enabled |
| `when_modified` | array | Yes | File patterns that trigger autoplan |

#### tfcmt Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | boolean | Yes | - | Enable tfcmt integration |
| `skip_no_changes` | boolean | No | `false` | Skip comment when no changes |
| `ignore_warning` | boolean | No | `false` | Ignore Terraform warnings |

#### Requirements

- `mergeable`: PR must be in a mergeable state (no conflicts, passing checks)
- `approved`: PR must have at least one approval

### PR Comment Commands

Execute Terraform commands by commenting on a pull request:

```bash
# Run plan for all projects
/terraform plan

# Run plan for specific projects
/terraform plan -p production,staging

# Run apply for all projects (requires approval)
/terraform apply

# Run apply for specific project
/terraform apply -p production
```

## Security

### Fork Protection

Apply commands are automatically blocked on forked PRs to prevent:
- Unauthorized access to secrets
- Malicious code execution
- Infrastructure compromise

### Requirements Enforcement

By default:
- **Plan**: Requires `mergeable` status
- **Apply**: Requires `mergeable` status and `approved` review

These can be customized per project in the configuration.

### Best Practices

1. **Use branch protection rules** to enforce code review
2. **Limit who can trigger workflows** using GitHub's workflow permissions
3. **Store sensitive variables** in GitHub Secrets or a secure secret manager
4. **Review Terraform changes** carefully before approving apply commands
5. **Enable CODEOWNERS** for Terraform directories

## Development

### Building

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Clean build artifacts
npm run clean

# Full package build
npm run package
```

### Project Structure

```
terraform-action/
├── src/
│   ├── main.ts              # Main entry point
│   ├── types.ts             # TypeScript type definitions
│   ├── config.ts            # Configuration parsing/validation
│   ├── comment-parser.ts    # PR comment parsing
│   ├── tfcmt.ts             # tfcmt download and setup
│   ├── terraform.ts         # Terraform execution
│   └── pr-validation.ts     # PR requirements validation
├── dist/                    # Compiled JavaScript (gitignored)
├── action.yml               # Action metadata
├── tsconfig.json            # TypeScript configuration
└── .terraform-action.yaml   # Example configuration
```

### Architecture

The action follows a clean, modular architecture:

1. **Event Validation**: Ensures action runs only on `issue_comment` events
2. **Comment Parsing**: Extracts Terraform command and target projects
3. **Config Loading**: Loads and validates YAML configuration
4. **PR Validation**: Fetches PR info and validates requirements
5. **Security Checks**: Blocks forked PR applies
6. **tfcmt Setup**: Downloads and configures tfcmt CLI
7. **Terraform Execution**: Runs commands serially per project
8. **Comment Posting**: Posts formatted output via tfcmt

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | - | GitHub token for API access |
| `config-path` | No | `.terraform-action.yaml` | Path to configuration file |

## Environment Variables

The action requires these environment variables (automatically set by GitHub Actions):

- `GITHUB_TOKEN`: Set via the `github-token` input
- `GITHUB_REPOSITORY`: Repository name
- `GITHUB_EVENT_PATH`: Path to event payload

## Comparison with Atlantis

| Feature | Terraform PR Action | Atlantis |
|---------|---------------------|----------|
| Deployment | GitHub Action | Standalone server |
| Language | TypeScript | Go |
| Configuration | YAML | YAML |
| tfcmt | Native integration | Separate setup |
| State | Stateless | Maintains locks |
| Complexity | Minimal | Higher |

## Troubleshooting

### "Terraform is not installed"

Ensure you include the `hashicorp/setup-terraform` step before this action.

### "Configuration file not found"

Check that `.terraform-action.yaml` exists in your repository root, or specify a custom path via `config-path`.

### "PR requirements not met"

Verify that:
- PR is mergeable (no conflicts)
- PR has required approvals for apply commands
- Branch protection rules are satisfied

### "Project not found in configuration"

When using `-p` flag, ensure project names exactly match those in your config file.

## License

ISC

## Contributing

Contributions are welcome! Please ensure:

1. Code follows TypeScript best practices
2. All functions include JSDoc comments
3. Error handling is comprehensive
4. Changes include appropriate tests

## Credits

- Inspired by [Atlantis](https://www.runatlantis.io/)
- Uses [tfcmt](https://github.com/suzuki-shunsuke/tfcmt) for PR comments
- Built with [@actions toolkit](https://github.com/actions/toolkit)
