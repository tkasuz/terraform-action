/**
 * Unit tests for configuration parsing and validation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { loadConfig, getDefaultRequirements } from './config';

// Mock fs and yaml modules
jest.mock('node:fs');
jest.mock('js-yaml');

describe('config', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockYaml = yaml as jest.Mocked<typeof yaml>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load and parse valid configuration', () => {
      const configPath = '/path/to/config.yaml';
      const configContent = 'projects:\n  - name: production\n    dir: terraform/prod';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(configContent);
      mockYaml.load.mockReturnValue({
        projects: [
          { name: 'production', dir: 'terraform/prod' },
          { name: 'staging', dir: 'terraform/staging' },
        ],
      });

      const config = loadConfig(configPath);

      expect(config).toEqual({
        projects: [
          { name: 'production', dir: 'terraform/prod' },
          { name: 'staging', dir: 'terraform/staging' },
        ],
      });
      expect(mockFs.existsSync).toHaveBeenCalledWith(path.resolve(configPath));
    });

    it('should load configuration with autoplan settings', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            autoplan: {
              enabled: true,
              when_modified: ['**/*.tf', 'terraform.tfvars'],
            },
          },
        ],
      });

      const config = loadConfig('/path/to/config.yaml');

      expect(config.projects[0].autoplan).toEqual({
        enabled: true,
        when_modified: ['**/*.tf', 'terraform.tfvars'],
      });
    });

    it('should load configuration with requirements', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            plan_requirements: ['mergeable'],
            apply_requirements: ['mergeable', 'approved'],
          },
        ],
      });

      const config = loadConfig('/path/to/config.yaml');

      expect(config.projects[0].plan_requirements).toEqual(['mergeable']);
      expect(config.projects[0].apply_requirements).toEqual(['mergeable', 'approved']);
    });

    it('should throw error when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        loadConfig('/nonexistent/config.yaml');
      }).toThrow('Configuration file not found');
    });

    it('should throw error when file cannot be read', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Failed to read configuration file: Permission denied');
    });

    it('should throw error for invalid YAML', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid yaml');
      mockYaml.load.mockImplementation(() => {
        throw new Error('bad indentation');
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Failed to parse YAML');
    });

    it('should throw error when projects array is missing', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({ name: 'my-config' });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Configuration must have a "projects" array');
    });

    it('should throw error when projects array is empty', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({ projects: [] });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Configuration must have at least one project');
    });

    it('should throw error for duplicate project names', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          { name: 'production', dir: 'terraform/prod1' },
          { name: 'production', dir: 'terraform/prod2' },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Duplicate project name: production');
    });

    it('should throw error for project without name', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [{ dir: 'terraform/prod' }],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow("Project at index 0 must have a non-empty 'name' field");
    });

    it('should throw error for project with empty name', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [{ name: '', dir: 'terraform/prod' }],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow("Project at index 0 must have a non-empty 'name' field");
    });

    it('should throw error for project without dir', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [{ name: 'production' }],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow("Project production must have a non-empty 'dir' field");
    });

    it('should throw error for invalid autoplan configuration', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            autoplan: 'invalid',
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Project production: autoplan must be an object');
    });

    it('should throw error for autoplan without enabled field', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            autoplan: {
              when_modified: ['**/*.tf'],
            },
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Project production: autoplan.enabled must be a boolean');
    });

    it('should throw error for autoplan without when_modified field', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            autoplan: {
              enabled: true,
            },
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Project production: autoplan.when_modified must be an array');
    });

    it('should throw error for invalid when_modified items', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            autoplan: {
              enabled: true,
              when_modified: ['**/*.tf', 123],
            },
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Project production: autoplan.when_modified must contain only strings');
    });

    it('should throw error for invalid plan_requirements', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            plan_requirements: ['invalid_requirement'],
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Invalid requirement in Project production: plan_requirements');
    });

    it('should throw error when requirements is not an array', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            plan_requirements: 'mergeable',
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Project production: plan_requirements must be an array');
    });

    it('should throw error for invalid apply_requirements', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.load.mockReturnValue({
        projects: [
          {
            name: 'production',
            dir: 'terraform/prod',
            apply_requirements: ['bad_requirement'],
          },
        ],
      });

      expect(() => {
        loadConfig('/path/to/config.yaml');
      }).toThrow('Invalid requirement in Project production: apply_requirements');
    });
  });

  describe('getDefaultRequirements', () => {
    it('should return mergeable for plan command', () => {
      const requirements = getDefaultRequirements('plan');

      expect(requirements).toEqual(['mergeable']);
    });

    it('should return mergeable and approved for apply command', () => {
      const requirements = getDefaultRequirements('apply');

      expect(requirements).toEqual(['mergeable', 'approved']);
    });
  });
});
