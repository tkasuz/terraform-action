/**
 * Configuration parsing and validation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { Config, ProjectConfig, Requirement } from './types';

/**
 * Validates that requirements are valid
 */
function validateRequirements(requirements: unknown, fieldName: string): Requirement[] {
  if (!Array.isArray(requirements)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const validRequirements: Requirement[] = ['mergeable', 'approved'];

  for (const req of requirements) {
    if (!validRequirements.includes(req as Requirement)) {
      throw new Error(
        `Invalid requirement in ${fieldName}: ${req}. Must be one of: ${validRequirements.join(', ')}`
      );
    }
  }

  return requirements as Requirement[];
}

/**
 * Validates a single project configuration
 */
function validateProject(project: unknown, index: number): ProjectConfig {
  if (!project || typeof project !== 'object') {
    throw new Error(`Project at index ${index} must be an object`);
  }

  const p = project as Record<string, unknown>;

  // Validate name
  if (typeof p.name !== 'string' || p.name.trim() === '') {
    throw new Error(`Project at index ${index} must have a non-empty 'name' field`);
  }

  // Validate dir
  if (typeof p.dir !== 'string' || p.dir.trim() === '') {
    throw new Error(`Project ${p.name} must have a non-empty 'dir' field`);
  }

  const validated: ProjectConfig = {
    name: p.name,
    dir: p.dir,
  };

  // Validate autoplan if present
  if (p.autoplan !== undefined) {
    if (typeof p.autoplan !== 'object' || p.autoplan === null) {
      throw new Error(`Project ${p.name}: autoplan must be an object`);
    }

    const autoplan = p.autoplan as Record<string, unknown>;

    if (typeof autoplan.enabled !== 'boolean') {
      throw new Error(`Project ${p.name}: autoplan.enabled must be a boolean`);
    }

    if (!Array.isArray(autoplan.when_modified)) {
      throw new Error(`Project ${p.name}: autoplan.when_modified must be an array`);
    }

    if (!autoplan.when_modified.every((item) => typeof item === 'string')) {
      throw new Error(`Project ${p.name}: autoplan.when_modified must contain only strings`);
    }

    validated.autoplan = {
      enabled: autoplan.enabled,
      when_modified: autoplan.when_modified as string[],
    };
  }

  // Validate plan_requirements if present
  if (p.plan_requirements !== undefined) {
    validated.plan_requirements = validateRequirements(
      p.plan_requirements,
      `Project ${p.name}: plan_requirements`
    );
  }

  // Validate apply_requirements if present
  if (p.apply_requirements !== undefined) {
    validated.apply_requirements = validateRequirements(
      p.apply_requirements,
      `Project ${p.name}: apply_requirements`
    );
  }

  return validated;
}

/**
 * Validates the configuration object
 */
function validateConfig(config: unknown): Config {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object');
  }

  const c = config as Record<string, unknown>;

  // Validate projects array
  if (!Array.isArray(c.projects)) {
    throw new Error('Configuration must have a "projects" array');
  }

  if (c.projects.length === 0) {
    throw new Error('Configuration must have at least one project');
  }

  const projects = c.projects.map((project, index) => validateProject(project, index));

  // Check for duplicate project names
  const names = new Set<string>();
  for (const project of projects) {
    if (names.has(project.name)) {
      throw new Error(`Duplicate project name: ${project.name}`);
    }
    names.add(project.name);
  }

  const validated: Config = { projects };

  return validated;
}

/**
 * Loads and parses the configuration file
 *
 * @param configPath - Path to the YAML configuration file
 * @returns Validated configuration object
 * @throws Error if file doesn't exist, is invalid YAML, or fails validation
 */
export function loadConfig(configPath: string): Config {
  // Resolve to absolute path
  const absolutePath = path.resolve(configPath);

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Configuration file not found: ${absolutePath}`);
  }

  // Read file
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    throw new Error(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate and return
  return validateConfig(parsed);
}

/**
 * Gets default requirements based on command type
 *
 * @param command - Terraform command ('plan' or 'apply')
 * @returns Default requirements array
 */
export function getDefaultRequirements(command: 'plan' | 'apply'): Requirement[] {
  return command === 'apply' ? ['mergeable', 'approved'] : ['mergeable'];
}
