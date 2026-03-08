<div align="center">

# 🚀 Terraform PR Comment Action

**Run Terraform via PR comments with apply-before-merge workflow**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/GitHub-Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Terraform](https://img.shields.io/badge/Terraform-7B42BC?logo=terraform&logoColor=white)](https://www.terraform.io/)

Inspired by [Atlantis](https://www.runatlantis.io/) • Powered by [tfcmt](https://github.com/suzuki-shunsuke/tfcmt)

</div>

---

## ✨ Features

- 💬 **PR Comment Triggered** - Execute Terraform via `terraform plan` or `terraform apply` comments
- 📦 **Multi-Project Support** - Manage multiple Terraform projects in one repository
- 🤖 **Autoplan** - Automatically run plan when Terraform files are modified
- ✅ **Requirements Enforcement** - Validate mergeable status and approvals before execution
- 📝 **Formatted Output** - Beautiful PR comments powered by tfcmt

---

## 🚀 Quick Start

### 1️⃣ Create Workflow File

Create `.github/workflows/terraform-pr.yml`:

```yaml
name: Terraform PR

on:
  issue_comment:
    types: [created]
  pull_request:
    types: [opened, synchronize, closed]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  terraform:
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'pull_request' ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       startsWith(github.event.comment.body, 'terraform'))

    steps:
      - name: Checkout PR code
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.7.0

      - name: Run terraform-action
        uses: tkasuz/terraform-action@v1.1.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          config-path: .terraform-action.yaml
```

### 2️⃣ Create Configuration File

Create `.terraform-action.yaml`:

```yaml
automerge: true
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
```

### 3️⃣ Use in Pull Requests

Comment on a pull request:

```bash
# 📋 Plan all projects
terraform plan

# 📋 Plan specific projects
terraform plan -project=production,staging

# 🚀 Apply all projects
terraform apply

# 🚀 Apply specific project
terraform apply -project=production
```

---

## ⚙️ Configuration Reference

### 📁 Project Settings

| Field | Required | Description |
|-------|:--------:|-------------|
| `name` | ✅ | Project name |
| `dir` | ✅ | Directory containing Terraform files |
| `autoplan.enabled` | ❌ | Enable automatic plan on file changes |
| `autoplan.when_modified` | ❌ | File patterns that trigger autoplan |
| `plan_requirements` | ❌ | Requirements for plan (default: `[mergeable]`) |
| `apply_requirements` | ❌ | Requirements for apply (default: `[mergeable, approved]`) |

### 🔐 Requirements

| Requirement | Description |
|-------------|-------------|
| `mergeable` | PR must be mergeable (no conflicts, passing checks) |
| `approved` | PR must have at least one approval |

---

## 🔧 Troubleshooting

<details>
<summary><b>"Terraform is not installed"</b></summary>
<br>
Add the <code>hashicorp/setup-terraform</code> step before this action.
</details>

<details>
<summary><b>"Configuration file not found"</b></summary>
<br>
Ensure <code>.terraform-action.yaml</code> exists in your repository root.
</details>

<details>
<summary><b>"PR requirements not met"</b></summary>
<br>
Verify the PR is mergeable and has required approvals.
</details>

<details>
<summary><b>"Project not found"</b></summary>
<br>
Check that project names in <code>-p</code> flag match your config file.
</details>

---

## 📄 License

[MIT](LICENSE)
