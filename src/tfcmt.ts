/**
 * tfcmt CLI download and setup logic
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';

/**
 * Full tfcmt configuration based on the upstream default, with the plan
 * template extended to show a "Run this plan again" command using -project=.
 *
 * @see https://suzuki-shunsuke.github.io/tfcmt/config/#default-configuration
 */
const TFCMT_CONFIG = `
embedded_var_names: []

templates:
  plan_title: "## {{if eq .ExitCode 1}}:x: {{end}}Plan Result{{if .Vars.target}} ({{.Vars.target}}){{end}}"
  apply_title: "## :{{if eq .ExitCode 0}}white_check_mark{{else}}x{{end}}: Apply Result{{if .Vars.target}} ({{.Vars.target}}){{end}}"
  result: "{{if .Result}}<pre><code>{{ .Result }}</code></pre>{{end}}"
  updated_resources: |
    {{if .CreatedResources}}
    * Create
    {{- range .CreatedResources}}
      * {{.}}
    {{- end}}{{end}}{{if .UpdatedResources}}
    * Update
    {{- range .UpdatedResources}}
      * {{.}}
    {{- end}}{{end}}{{if .DeletedResources}}
    * Delete
    {{- range .DeletedResources}}
      * {{.}}
    {{- end}}{{end}}{{if .ReplacedResources}}
    * Replace
    {{- range .ReplacedResources}}
      * {{.}}
    {{- end}}{{end}}{{if .ImportedResources}}
    * Import
    {{- range .ImportedResources}}
      * {{.}}
    {{- end}}{{end}}{{if .MovedResources}}
    * Move
    {{- range .MovedResources}}
      * {{.Before}} => {{.After}}
    {{- end}}{{end}}
  deletion_warning: |
    {{if .HasDestroy}}
    ### :warning: Resource Deletion will happen :warning:
    This plan contains resource delete operation. Please check the plan result very carefully!
    {{end}}
  changed_result: |
    {{if .ChangedResult}}
    <details><summary>Change Result (Click me)</summary>
    {{wrapCode .ChangedResult}}
    </details>
    {{end}}
  change_outside_terraform: |
    {{if .ChangeOutsideTerraform}}
    <details><summary>:information_source: Objects have changed outside of Terraform</summary>
    _This feature was introduced from [Terraform v0.15.4](https://github.com/hashicorp/terraform/releases/tag/v0.15.4)._
    {{wrapCode .ChangeOutsideTerraform}}
    </details>
    {{end}}
  warning: |
    {{if .Warning}}
    ## :warning: Warnings :warning:
    {{wrapCode .Warning}}
    {{end}}
  error_messages: |
    {{if .ErrorMessages}}
    ## :warning: Errors
    {{range .ErrorMessages}}
    * {{. -}}
    {{- end}}{{end}}
  guide_apply_failure: ""
  guide_apply_parse_error: ""

terraform:
  plan:
    disable_label: false
    ignore_warning: false
    template: |
      {{template "plan_title" .}}
      {{if .Link}}[CI link]({{.Link}}){{end}}
      {{template "deletion_warning" .}}
      {{template "result" .}}
      {{template "updated_resources" .}}
      {{template "changed_result" .}}
      {{template "change_outside_terraform" .}}
      {{template "warning" .}}
      {{template "error_messages" .}}
      {{if .Vars.target}}
      ---
      **Run this plan again:**
      \`\`\`
      terraform plan -project={{.Vars.target}}
      \`\`\`
      **Apply this plan:**
      \`\`\`
      terraform apply -project={{.Vars.target}}
      \`\`\`
      {{end}}
    when_add_or_update_only:
      label: "{{if .Vars.target}}{{.Vars.target}}/{{end}}add-or-update"
      label_color: 1d76db
    when_destroy:
      label: "{{if .Vars.target}}{{.Vars.target}}/{{end}}destroy"
      label_color: d93f0b
    when_no_changes:
      label: "{{if .Vars.target}}{{.Vars.target}}/{{end}}no-changes"
      label_color: 0e8a16
    when_plan_error:
      label:
      label_color:
    when_parse_error:
      template: |
        {{template "plan_title" .}}
        {{if .Link}}[CI link]({{.Link}}){{end}}
        It failed to parse the result.
        <details><summary>Details (Click me)</summary>
        {{wrapCode .CombinedOutput}}
        </details>
  apply:
    template: |
      {{template "apply_title" .}}
      {{if .Link}}[CI link]({{.Link}}){{end}}
      {{if ne .ExitCode 0}}{{template "guide_apply_failure" .}}{{end}}
      {{template "result" .}}
      <details><summary>Details (Click me)</summary>
      {{wrapCode .CombinedOutput}}
      </details>
      {{template "error_messages" .}}
    when_parse_error:
      template: |
        {{template "apply_title" .}}
        {{if .Link}}[CI link]({{.Link}}){{end}}
        {{template "guide_apply_parse_error" .}}
        It failed to parse the result.
        <details><summary>Details (Click me)</summary>
        {{wrapCode .CombinedOutput}}
        </details>
`.trimStart();

/**
 * Writes a tfcmt configuration file to a temp directory and returns the path.
 */
export function writeTfcmtConfig(): string {
  const configPath = path.join(os.tmpdir(), '.tfcmt-action.yml');
  fs.writeFileSync(configPath, TFCMT_CONFIG, 'utf8');
  core.info(`tfcmt config written to ${configPath}`);
  return configPath;
}

/**
 * Maps Node.js platform to tfcmt platform naming
 */
function getTfcmtPlatform(): string {
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'windows';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Maps Node.js architecture to tfcmt architecture naming
 */
function getTfcmtArch(): string {
  const arch = os.arch();

  switch (arch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    case 'arm':
      return 'arm';
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

/**
 * Downloads and sets up tfcmt CLI
 *
 * @param version - Version to download (default: 'latest')
 * @returns Path to the tfcmt binary
 * @throws Error if download or extraction fails
 *
 * @remarks
 * Downloads tfcmt from GitHub releases, extracts the archive,
 * and makes the binary executable.
 */
export async function setupTfcmt(version = 'latest'): Promise<string> {
  core.info('Setting up tfcmt...');

  const platform = getTfcmtPlatform();
  const arch = getTfcmtArch();

  // Construct download URL
  const fileName =
    platform === 'windows' ? `tfcmt_${platform}_${arch}.zip` : `tfcmt_${platform}_${arch}.tar.gz`;

  const url =
    version === 'latest'
      ? `https://github.com/suzuki-shunsuke/tfcmt/releases/latest/download/${fileName}`
      : `https://github.com/suzuki-shunsuke/tfcmt/releases/download/${version}/${fileName}`;

  core.info(`Downloading tfcmt from ${url}`);

  let downloadPath: string;
  try {
    downloadPath = await tc.downloadTool(url);
  } catch (error) {
    throw new Error(
      `Failed to download tfcmt: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  core.info('Extracting tfcmt...');

  let extractedPath: string;
  try {
    if (platform === 'windows') {
      extractedPath = await tc.extractZip(downloadPath);
    } else {
      extractedPath = await tc.extractTar(downloadPath);
    }
  } catch (error) {
    throw new Error(
      `Failed to extract tfcmt: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Locate binary
  const binaryName = platform === 'windows' ? 'tfcmt.exe' : 'tfcmt';
  const tfcmtPath = path.join(extractedPath, binaryName);

  // Verify binary exists
  if (!fs.existsSync(tfcmtPath)) {
    throw new Error(`tfcmt binary not found at ${tfcmtPath}`);
  }

  // Make executable on Unix-like systems
  if (platform !== 'windows') {
    try {
      fs.chmodSync(tfcmtPath, 0o755);
    } catch (error) {
      throw new Error(
        `Failed to make tfcmt executable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  core.info(`tfcmt setup complete: ${tfcmtPath}`);

  return tfcmtPath;
}
