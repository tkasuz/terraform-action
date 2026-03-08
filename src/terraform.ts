/**
 * Terraform execution logic
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type { TerraformCommand, TerraformResult } from './types';

/**
 * Executes Terraform command wrapped with tfcmt
 *
 * @param tfcmtPath - Path to tfcmt binary
 * @param command - Terraform command to execute ('plan' or 'apply')
 * @param workingDir - Directory containing Terraform files
 * @param projectName - Name of the project (used for plan file naming and tfcmt target)
 * @param additionalArgs - Additional terraform arguments (e.g., -target, -var-file)
 * @param planFilePath - Path to existing plan file (for apply command)
 * @returns Terraform execution result
 *
 * @remarks
 * Executes: tfcmt -var "target:<projectName>" plan -- terraform plan [args]
 * - Uses tfcmt's target variable for monorepo support to prefix PR labels and comment titles
 * - Terraform plan returns exit code 0 for no changes, 2 for changes detected, 1 for errors
 * - Terraform apply returns exit code 0 for success, 1 for errors
 * - tfcmt automatically posts output as PR comment
 * - For plan commands, saves plan file to <workingDir>/tfplan-<projectName>
 * - For apply commands, uses provided planFilePath if available
 */
export async function executeTerraform(
  tfcmtPath: string,
  command: TerraformCommand,
  workingDir: string,
  projectName: string,
  additionalArgs: string[] = [],
  planFilePath?: string,
  tfcmtConfigPath?: string,
  prNumber?: number
): Promise<TerraformResult> {
  const argsStr = additionalArgs.length > 0 ? ` ${additionalArgs.join(' ')}` : '';
  core.info(`Executing terraform ${command}${argsStr} in ${workingDir}`);

  // Build tfcmt arguments: tfcmt [flags] -var "target:<project>" plan|apply -- terraform [command] [args]
  const tfcmtArgs: string[] = [];

  // Pass custom config file if provided (-config must come first)
  if (tfcmtConfigPath) {
    tfcmtArgs.push('-config');
    tfcmtArgs.push(tfcmtConfigPath);
  }

  // Explicitly pass PR number so tfcmt can post comments for issue_comment and
  // pull_request closed events where GITHUB_REF is not a PR ref
  if (prNumber !== undefined) {
    tfcmtArgs.push('-pr');
    tfcmtArgs.push(String(prNumber));
  }

  // Add target variable for monorepo support
  // This will prefix PR labels and comment titles with the project name
  tfcmtArgs.push('-var');
  tfcmtArgs.push(`target:${projectName}`);

  // Add command
  tfcmtArgs.push(command);

  // Add separator and terraform command
  tfcmtArgs.push('--');
  tfcmtArgs.push('terraform');
  tfcmtArgs.push(command);

  // Generate plan file path for plan command, or use provided path for apply
  let resultPlanFilePath: string | undefined;

  if (command === 'plan') {
    // Save plan to a file: tfplan-<projectName>
    resultPlanFilePath = path.join(workingDir, `tfplan-${projectName}`);
    tfcmtArgs.push(`-out=${resultPlanFilePath}`);
    core.info(`Plan will be saved to: ${resultPlanFilePath}`);
  } else if (command === 'apply' && planFilePath) {
    // Use existing plan file
    tfcmtArgs.push(planFilePath);
    core.info(`Applying existing plan from: ${planFilePath}`);
  } else if (command === 'apply') {
    // Apply without plan file (legacy behavior)
    tfcmtArgs.push('-auto-approve');
  }

  tfcmtArgs.push(...additionalArgs);
  tfcmtArgs.push('-no-color');
  tfcmtArgs.push('-input=false');

  // Capture stdout and stderr
  let stdout = '';
  let stderr = '';

  // Build env — when triggered by issue_comment the inherited GITHUB_EVENT_NAME
  // is "issue_comment" and the event payload has no pull_request key, so tfcmt
  // skips posting a PR comment.  Override with a synthetic pull_request event so
  // tfcmt always posts the comment regardless of the triggering event type.
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  if (prNumber !== undefined) {
    const syntheticEvent = JSON.stringify({ number: prNumber, pull_request: { number: prNumber } });
    const eventPath = path.join(os.tmpdir(), `tfcmt-event-${prNumber}.json`);
    fs.writeFileSync(eventPath, syntheticEvent);
    env['GITHUB_EVENT_NAME'] = 'pull_request';
    env['GITHUB_EVENT_PATH'] = eventPath;
    env['GITHUB_REF'] = `refs/pull/${prNumber}/merge`;
    core.info(`Overriding GITHUB_EVENT_NAME=pull_request, GITHUB_EVENT_PATH=${eventPath}`);
  }

  const options: exec.ExecOptions = {
    cwd: workingDir,
    env,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
      },
    },
  };

  let exitCode = 0;
  try {
    exitCode = await exec.exec('terraform init', [], options);
    exitCode = await exec.exec(tfcmtPath, tfcmtArgs, options);
  } catch (error) {
    throw new Error(
      `Failed to execute tfcmt/terraform: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // For plan command, exit code 2 means changes detected
  const hasChanges = command === 'plan' && exitCode === 2;

  // Exit codes: 0 = success/no changes, 1 = error, 2 = changes (plan only)
  if (exitCode === 1) {
    throw new Error(`Terraform ${command} failed with exit code 1:\n${stderr}`);
  }

  core.info(`Terraform ${command} completed with exit code ${exitCode}`);

  return {
    exitCode,
    hasChanges,
    stdout,
    stderr,
    planFilePath: resultPlanFilePath,
  };
}

/**
 * Executes Terraform command with tfcmt integration
 *
 * @param tfcmtPath - Path to tfcmt binary
 * @param command - Terraform command to execute
 * @param projectName - Name of the project being executed
 * @param workingDir - Directory containing Terraform files
 * @param additionalArgs - Additional terraform arguments
 * @param planFilePath - Path to existing plan file (for apply command)
 * @returns Terraform execution result
 *
 * @remarks
 * Executes terraform wrapped with tfcmt for automatic PR comment posting
 */
export async function executeTerraformWithTfcmt(
  tfcmtPath: string,
  command: TerraformCommand,
  projectName: string,
  workingDir: string,
  additionalArgs: string[] = [],
  planFilePath?: string,
  tfcmtConfigPath?: string,
  prNumber?: number
): Promise<TerraformResult> {
  const argsStr = additionalArgs.length > 0 ? ` ${additionalArgs.join(' ')}` : '';
  core.startGroup(`Executing terraform ${command}${argsStr} for project: ${projectName}`);

  try {
    return await executeTerraform(
      tfcmtPath,
      command,
      workingDir,
      projectName,
      additionalArgs,
      planFilePath,
      tfcmtConfigPath,
      prNumber
    );
  } finally {
    core.endGroup();
  }
}

/**
 * Validates that Terraform is installed and available
 *
 * @throws Error if Terraform is not found or version check fails
 */
export async function validateTerraformInstalled(): Promise<void> {
  core.info('Validating Terraform installation...');

  try {
    await exec.exec('terraform', ['version']);
  } catch (_error) {
    throw new Error(
      'Terraform is not installed or not available in PATH. ' +
        'Please ensure Terraform is installed before running this action.'
    );
  }
}
