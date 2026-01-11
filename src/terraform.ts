/**
 * Terraform execution logic
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { TerraformCommand, TerraformResult, TfcmtConfig } from './types';

/**
 * Executes Terraform command wrapped with tfcmt
 *
 * @param tfcmtPath - Path to tfcmt binary
 * @param command - Terraform command to execute ('plan' or 'apply')
 * @param workingDir - Directory containing Terraform files
 * @param additionalArgs - Additional terraform arguments (e.g., -target, -var-file)
 * @param tfcmtConfig - Optional tfcmt configuration
 * @returns Terraform execution result
 *
 * @remarks
 * Executes: tfcmt plan -- terraform plan [args]
 * - Terraform plan returns exit code 0 for no changes, 2 for changes detected, 1 for errors
 * - Terraform apply returns exit code 0 for success, 1 for errors
 * - tfcmt automatically posts output as PR comment
 */
export async function executeTerraform(
  tfcmtPath: string,
  command: TerraformCommand,
  workingDir: string,
  additionalArgs: string[] = [],
  tfcmtConfig?: TfcmtConfig
): Promise<TerraformResult> {
  const argsStr = additionalArgs.length > 0 ? ` ${additionalArgs.join(' ')}` : '';
  core.info(`Executing terraform ${command}${argsStr} in ${workingDir}`);

  // Build tfcmt arguments: tfcmt [flags] plan|apply -- terraform [command] [args]
  const tfcmtArgs: string[] = [command];

  // Add tfcmt configuration flags
  if (tfcmtConfig?.skip_no_changes) {
    tfcmtArgs.push('--skip-no-changes');
  }

  if (tfcmtConfig?.ignore_warning) {
    tfcmtArgs.push('--ignore-warning');
  }

  // Add separator and terraform command
  tfcmtArgs.push('--');
  tfcmtArgs.push('terraform');
  tfcmtArgs.push(command);
  tfcmtArgs.push(...additionalArgs);
  tfcmtArgs.push('-no-color');
  tfcmtArgs.push('-input=false');

  // Add auto-approve for apply
  if (command === 'apply') {
    tfcmtArgs.push('-auto-approve');
  }

  // Capture stdout and stderr
  let stdout = '';
  let stderr = '';

  const options: exec.ExecOptions = {
    cwd: workingDir,
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
 * @param tfcmtConfig - Optional tfcmt configuration
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
  tfcmtConfig?: TfcmtConfig
): Promise<TerraformResult> {
  const argsStr = additionalArgs.length > 0 ? ` ${additionalArgs.join(' ')}` : '';
  core.startGroup(`Executing terraform ${command}${argsStr} for project: ${projectName}`);

  try {
    // Execute Terraform wrapped with tfcmt if enabled
    if (tfcmtConfig?.enabled) {
      return await executeTerraform(tfcmtPath, command, workingDir, additionalArgs, tfcmtConfig);
    } else {
      // Execute Terraform without tfcmt
      return await executeTerraform(tfcmtPath, command, workingDir, additionalArgs);
    }
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
  } catch (error) {
    throw new Error(
      'Terraform is not installed or not available in PATH. ' +
      'Please ensure Terraform is installed before running this action.'
    );
  }
}
