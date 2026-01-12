/**
 * PR comment parsing logic
 */

import type { ParsedComment, TerraformCommand } from './types';

/**
 * Regular expression to match terraform commands in comments
 * Matches: terraform plan|apply [optional arguments]
 */
const TERRAFORM_COMMAND_REGEX = /^terraform\s+(plan|apply)(?:\s+(.+))?$/;

/**
 * Parses a PR comment to extract terraform command, target projects, and additional arguments
 *
 * @param commentBody - The body of the comment to parse
 * @returns Parsed comment or null if comment doesn't contain a terraform command
 *
 * @example
 * parseComment('terraform plan')
 * // => { command: 'plan', projects: [], args: [] }
 *
 * @example
 * parseComment('terraform apply -project=production,staging')
 * // => { command: 'apply', projects: ['production', 'staging'], args: [] }
 *
 * @example
 * parseComment('terraform plan -project=staging -target=aws_instance.example')
 * // => { command: 'plan', projects: ['staging'], args: ['-target=aws_instance.example'] }
 *
 * @example
 * parseComment('terraform plan -target=aws_instance.example -var-file=prod.tfvars')
 * // => { command: 'plan', projects: [], args: ['-target=aws_instance.example', '-var-file=prod.tfvars'] }
 *
 * @example
 * parseComment('Just a regular comment')
 * // => null
 */
export function parseComment(commentBody: string): ParsedComment | null {
  // Trim whitespace
  const trimmed = commentBody.trim();

  // Match against regex
  const match = trimmed.match(TERRAFORM_COMMAND_REGEX);

  if (!match) {
    return null;
  }

  const command = match[1] as TerraformCommand;
  const argsString = match[2];

  // Parse arguments
  const { projects, args } = parseArguments(argsString || '');

  return {
    command,
    projects,
    args,
  };
}

/**
 * Parses argument string to extract projects and other terraform arguments
 *
 * @param argsString - String containing space-separated arguments
 * @returns Object with projects array and args array
 *
 * @example
 * parseArguments('-project=production,staging -target=aws_instance.example')
 * // => { projects: ['production', 'staging'], args: ['-target=aws_instance.example'] }
 *
 * @example
 * parseArguments('-target=aws_instance.example -var-file=prod.tfvars')
 * // => { projects: [], args: ['-target=aws_instance.example', '-var-file=prod.tfvars'] }
 */
function parseArguments(argsString: string): { projects: string[]; args: string[] } {
  if (!argsString) {
    return { projects: [], args: [] };
  }

  const tokens = tokenizeArguments(argsString);
  const projects: string[] = [];
  const args: string[] = [];

  for (const token of tokens) {
    // Check for -project=value format
    if (token.startsWith('-project=')) {
      const projectList = token.substring('-project='.length);
      projects.push(
        ...projectList
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      );
    } else {
      // It's a regular terraform argument
      args.push(token);
    }
  }

  return { projects, args };
}

/**
 * Tokenizes argument string, respecting quotes
 *
 * @param argsString - String containing space-separated arguments
 * @returns Array of individual tokens
 *
 * @example
 * tokenizeArguments('-target=aws_instance.example -var="foo=bar"')
 * // => ['-target=aws_instance.example', '-var=foo=bar']
 */
function tokenizeArguments(argsString: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Validates that the specified projects exist in configuration
 *
 * @param requestedProjects - Array of project names from the comment
 * @param configuredProjects - Array of configured project names
 * @throws Error if any requested project doesn't exist in configuration
 */
export function validateProjectNames(
  requestedProjects: string[],
  configuredProjects: string[]
): void {
  const configuredSet = new Set(configuredProjects);

  for (const project of requestedProjects) {
    if (!configuredSet.has(project)) {
      const available = configuredProjects.join(', ');
      throw new Error(
        `Project '${project}' not found in configuration. ` + `Available projects: ${available}`
      );
    }
  }
}

/**
 * Determines which projects should be executed based on comment and configuration
 *
 * @param parsedComment - Parsed comment from PR
 * @param allProjects - All project names from configuration
 * @returns Array of project names to execute
 *
 * @remarks
 * - If specific projects are requested, returns only those projects
 * - If no projects specified, returns all projects
 */
export function getTargetProjects(parsedComment: ParsedComment, allProjects: string[]): string[] {
  // If specific projects requested, validate and return them
  if (parsedComment.projects.length > 0) {
    validateProjectNames(parsedComment.projects, allProjects);
    return parsedComment.projects;
  }

  // Otherwise return all projects
  return allProjects;
}
