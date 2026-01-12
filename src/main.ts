/**
 * Main entry point for Terraform PR Comment Action
 */

import * as path from 'node:path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { downloadPlanFile, uploadPlanFile } from './artifact-manager';
import { parseComment, validateProjectNames } from './comment-parser';
import { getDefaultRequirements, loadConfig } from './config';
import {
  getCommentBodyFromContext,
  getPRNumberFromContext,
  getPullRequestInfo,
  validateEventType,
  validateRequirements,
} from './pr-validation';
import { executeTerraformWithTfcmt, validateTerraformInstalled } from './terraform';
import { setupTfcmt } from './tfcmt';
import type { ProjectConfig, PullRequestInfo, TerraformCommand } from './types';

/**
 * Main action execution
 */
async function run(): Promise<void> {
  try {
    // Validate event type
    validateEventType(github.context.eventName);

    // Get inputs
    const token = core.getInput('github-token', { required: true });
    process.env.GITHUB_TOKEN = token;
    const configPath = core.getInput('config-path') || '.terraform-action.yaml';

    core.info('Starting Terraform PR Comment Action');

    // Validate Terraform installation
    await validateTerraformInstalled();

    // Load configuration
    const config = loadConfig(configPath);
    core.info(`Loaded configuration with ${config.projects.length} project(s)`);

    let targetProjectNames: string[] = config.projects.map((p) => p.name);
    let command: TerraformCommand = 'plan';
    let args: string[] = [];

    // Extract comment body
    if (github.context.eventName === 'issue_comment') {
      const commentBody = getCommentBodyFromContext(github.context);
      core.info(`Processing comment: ${commentBody}`);

      // Parse comment
      const parsedComment = parseComment(commentBody);
      if (!parsedComment) {
        core.info('Comment does not contain a terraform command, skipping');
        return;
      }

      core.info(`Detected command: terraform ${parsedComment.command}`);

      if (parsedComment.projects.length > 0) {
        validateProjectNames(parsedComment.projects, targetProjectNames);
        targetProjectNames = parsedComment.projects;

        core.info(`Target projects: ${targetProjectNames.join(', ')}`);
      }
      command = parsedComment.command;
      args = parsedComment.args;
    }

    // Get PR information
    let pr: PullRequestInfo | null = null;
    if (command === 'apply') {
      const prNumber = getPRNumberFromContext(github.context);
      pr = await getPullRequestInfo(
        token,
        github.context.repo.owner,
        github.context.repo.repo,
        prNumber
      );
    }

    // Setup tfcmt
    const tfcmtPath = await setupTfcmt();

    // Execute terraform for each target project serially
    for (const projectName of targetProjectNames) {
      const project = config.projects.find((p) => p.name === projectName);
      if (!project) {
        throw new Error(`Project not found: ${projectName}`);
      }
      await executeProjectCommand(
        project,
        command,
        args,
        pr,
        tfcmtPath
      );
    }

    core.info('Terraform PR Comment Action completed successfully');
  } catch (error) {
    // Fail fast on any error
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

/**
 * Executes a terraform command for a single project
 *
 * @param project - Project configuration
 * @param command - Terraform command to execute
 * @param args - Additional terraform arguments
 * @param pr - Pull request information
 * @param tfcmtPath - Path to tfcmt binary
 * @param tfcmtConfig - Optional tfcmt configuration
 */
async function executeProjectCommand(
  project: ProjectConfig,
  command: 'plan' | 'apply',
  args: string[],
  pr: PullRequestInfo | null,
  tfcmtPath: string
): Promise<void> {
  core.info(`\n${'='.repeat(60)}`);
  core.info(`Project: ${project.name}`);
  core.info(`Directory: ${project.dir}`);
  core.info(`${'='.repeat(60)}\n`);

  // Get requirements for this command
  const requirements =
    command === 'plan'
      ? (project.plan_requirements ?? getDefaultRequirements('plan'))
      : (project.apply_requirements ?? getDefaultRequirements('apply'));

  core.info(`Requirements: ${requirements.join(', ')}`);

  // Validate requirements
  if (command === 'apply' && pr != null) {
    validateRequirements(pr, requirements);
    core.info('All requirements met');
  }

  // Resolve working directory
  const workingDir = path.resolve(project.dir);

  // For apply command, try to download the plan file artifact
  let planFilePath: string | undefined;
  if (command === 'apply') {
    try {
      planFilePath = await downloadPlanFile(project.name, workingDir);
      core.info(`Using plan file from artifact: ${planFilePath}`);
    } catch (error) {
      core.warning(
        `Could not download plan file artifact for project ${project.name}. Will proceed with apply without saved plan. Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Execute terraform with tfcmt
  const result = await executeTerraformWithTfcmt(
    tfcmtPath,
    command,
    project.name,
    workingDir,
    args,
    planFilePath
  );

  // Log results and upload plan file if this was a plan command
  if (command === 'plan') {
    if (result.hasChanges) {
      core.info('Changes detected in plan');
    } else {
      core.info('No changes detected in plan');
    }

    // Upload plan file as artifact for later use during apply
    if (result.planFilePath) {
      try {
        await uploadPlanFile(result.planFilePath, project.name);
        core.info(`Plan file uploaded as artifact for project: ${project.name}`);
      } catch (error) {
        core.warning(
          `Failed to upload plan file artifact. Apply will proceed without saved plan. Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } else {
    core.info('Apply completed successfully');
  }
}

// Execute main function
run();
