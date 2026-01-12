/**
 * Core type definitions for Terraform PR Action
 */

/**
 * Terraform command type
 */
export type TerraformCommand = 'plan' | 'apply';

/**
 * PR requirement types
 */
export type Requirement = 'mergeable' | 'approved';

/**
 * Autoplan configuration for a project
 */
export interface AutoplanConfig {
  /** Whether autoplan is enabled */
  enabled: boolean;
  /** File patterns that trigger autoplan when modified */
  when_modified: string[];
}

/**
 * Project configuration
 */
export interface ProjectConfig {
  /** Project name (must be unique) */
  name: string;
  /** Directory containing Terraform files */
  dir: string;
  /** Autoplan configuration */
  autoplan?: AutoplanConfig;
  /** Requirements for plan execution */
  plan_requirements?: Requirement[];
  /** Requirements for apply execution */
  apply_requirements?: Requirement[];
}

/**
 * Root configuration file structure
 */
export interface Config {
  /** List of Terraform projects */
  projects: ProjectConfig[];
}

/**
 * Parsed PR comment
 */
export interface ParsedComment {
  /** Terraform command (plan or apply) */
  command: TerraformCommand;
  /** Target projects (empty array means all projects) */
  projects: string[];
  /** Additional terraform arguments (e.g., -target, -var-file) */
  args: string[];
}

/**
 * GitHub Pull Request information
 */
export interface PullRequestInfo {
  /** PR number */
  number: number;
  /** Base repository owner */
  owner: string;
  /** Base repository name */
  repo: string;
  /** Whether PR is from a fork */
  isFork: boolean;
  /** Whether PR is mergeable */
  mergeable: boolean;
  /** Whether PR is approved */
  approved: boolean;
  /** PR head SHA */
  sha: string;
}

/**
 * Terraform execution result
 */
export interface TerraformResult {
  /** Exit code from terraform command */
  exitCode: number;
  /** Whether changes were detected (exit code 2 for plan) */
  hasChanges: boolean;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Path to plan file (for plan command) */
  planFilePath?: string;
}

/**
 * Action execution context
 */
export interface ActionContext {
  /** GitHub token */
  token: string;
  /** Path to configuration file */
  configPath: string;
  /** Parsed configuration */
  config: Config;
  /** Pull request information */
  pr: PullRequestInfo;
  /** Parsed comment */
  comment: ParsedComment;
  /** Path to tfcmt binary */
  tfcmtPath: string;
}
