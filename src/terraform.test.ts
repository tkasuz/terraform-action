/**
 * Unit tests for Terraform execution logic
 */

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as path from 'node:path';
import {
  executeTerraform,
  executeTerraformWithTfcmt,
  validateTerraformInstalled,
} from './terraform';

// Mock the @actions/core and @actions/exec modules
jest.mock('@actions/core');
jest.mock('@actions/exec');

describe('terraform', () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const mockExec = exec as jest.Mocked<typeof exec>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('executeTerraform', () => {
    const tfcmtPath = '/usr/local/bin/tfcmt';
    const workingDir = '/path/to/terraform';
    const projectName = 'test-project';

    it('should execute terraform plan successfully with no changes', async () => {
      // Mock exec to return exit code 0 (no changes)
      mockExec.exec.mockResolvedValue(0);

      const result = await executeTerraform(
        tfcmtPath,
        'plan',
        workingDir,
        projectName
      );

      // Verify terraform init was called
      expect(mockExec.exec).toHaveBeenCalledWith(
        'terraform init',
        [],
        expect.objectContaining({
          cwd: workingDir,
          ignoreReturnCode: true,
        })
      );

      // Verify tfcmt was called with correct arguments
      const expectedPlanPath = path.join(workingDir, `tfplan-${projectName}`);
      expect(mockExec.exec).toHaveBeenCalledWith(
        tfcmtPath,
        [
          '-var',
          `target:${projectName}`,
          'plan',
          '--',
          'terraform',
          'plan',
          `-out=${expectedPlanPath}`,
          '-no-color',
          '-input=false',
        ],
        expect.objectContaining({
          cwd: workingDir,
          ignoreReturnCode: true,
        })
      );

      // Verify result
      expect(result).toEqual({
        exitCode: 0,
        hasChanges: false,
        stdout: '',
        stderr: '',
        planFilePath: expectedPlanPath,
      });
    });

    it('should execute terraform plan successfully with changes detected', async () => {
      // Mock exec to return exit code 2 (changes detected)
      mockExec.exec.mockResolvedValueOnce(0); // terraform init
      mockExec.exec.mockResolvedValueOnce(2); // terraform plan with changes

      const result = await executeTerraform(
        tfcmtPath,
        'plan',
        workingDir,
        projectName
      );

      expect(result.exitCode).toBe(2);
      expect(result.hasChanges).toBe(true);
      expect(result.planFilePath).toBe(
        path.join(workingDir, `tfplan-${projectName}`)
      );
    });

    it('should execute terraform plan with additional arguments', async () => {
      mockExec.exec.mockResolvedValue(0);

      const additionalArgs = ['-target=resource.name', '-var-file=test.tfvars'];
      await executeTerraform(
        tfcmtPath,
        'plan',
        workingDir,
        projectName,
        additionalArgs
      );

      const expectedPlanPath = path.join(workingDir, `tfplan-${projectName}`);
      expect(mockExec.exec).toHaveBeenCalledWith(
        tfcmtPath,
        [
          '-var',
          `target:${projectName}`,
          'plan',
          '--',
          'terraform',
          'plan',
          `-out=${expectedPlanPath}`,
          ...additionalArgs,
          '-no-color',
          '-input=false',
        ],
        expect.any(Object)
      );
    });

    it('should execute terraform apply with existing plan file', async () => {
      mockExec.exec.mockResolvedValue(0);

      const planFilePath = '/path/to/tfplan-test-project';
      await executeTerraform(
        tfcmtPath,
        'apply',
        workingDir,
        projectName,
        [],
        planFilePath
      );

      expect(mockExec.exec).toHaveBeenCalledWith(
        tfcmtPath,
        [
          '-var',
          `target:${projectName}`,
          'apply',
          '--',
          'terraform',
          'apply',
          planFilePath,
          '-no-color',
          '-input=false',
        ],
        expect.any(Object)
      );
    });

    it('should execute terraform apply without plan file (auto-approve)', async () => {
      mockExec.exec.mockResolvedValue(0);

      await executeTerraform(tfcmtPath, 'apply', workingDir, projectName);

      expect(mockExec.exec).toHaveBeenCalledWith(
        tfcmtPath,
        [
          '-var',
          `target:${projectName}`,
          'apply',
          '--',
          'terraform',
          'apply',
          '-auto-approve',
          '-no-color',
          '-input=false',
        ],
        expect.any(Object)
      );
    });

    it('should throw error when terraform command fails with exit code 1', async () => {
      mockExec.exec.mockResolvedValueOnce(0); // terraform init succeeds
      mockExec.exec.mockResolvedValueOnce(1); // terraform plan fails

      await expect(
        executeTerraform(tfcmtPath, 'plan', workingDir, projectName)
      ).rejects.toThrow('Terraform plan failed with exit code 1');
    });

    it('should capture stdout and stderr from terraform execution', async () => {
      const mockStdout = 'Plan: 1 to add, 0 to change, 0 to destroy.';
      const mockStderr = 'Warning: some warning message';

      mockExec.exec.mockImplementation(
        async (
          _commandLine: string,
          _args?: string[],
          options?: exec.ExecOptions
        ): Promise<number> => {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from(mockStdout));
          }
          if (options?.listeners?.stderr) {
            options.listeners.stderr(Buffer.from(mockStderr));
          }
          return 0;
        }
      );

      const result = await executeTerraform(
        tfcmtPath,
        'plan',
        workingDir,
        projectName
      );

      expect(result.stdout).toContain(mockStdout);
      expect(result.stderr).toContain(mockStderr);
    });

    it('should throw error when exec throws an exception', async () => {
      const errorMessage = 'Command not found';
      mockExec.exec.mockRejectedValue(new Error(errorMessage));

      await expect(
        executeTerraform(tfcmtPath, 'plan', workingDir, projectName)
      ).rejects.toThrow(`Failed to execute tfcmt/terraform: ${errorMessage}`);
    });

    it('should log appropriate info messages', async () => {
      mockExec.exec.mockResolvedValue(0);

      await executeTerraform(tfcmtPath, 'plan', workingDir, projectName);

      expect(mockCore.info).toHaveBeenCalledWith(
        `Executing terraform plan in ${workingDir}`
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Plan will be saved to:')
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        'Terraform plan completed with exit code 0'
      );
    });

    it('should log info message with additional args when provided', async () => {
      mockExec.exec.mockResolvedValue(0);

      const additionalArgs = ['-target=resource.name'];
      await executeTerraform(
        tfcmtPath,
        'plan',
        workingDir,
        projectName,
        additionalArgs
      );

      expect(mockCore.info).toHaveBeenCalledWith(
        `Executing terraform plan -target=resource.name in ${workingDir}`
      );
    });
  });

  describe('executeTerraformWithTfcmt', () => {
    const tfcmtPath = '/usr/local/bin/tfcmt';
    const workingDir = '/path/to/terraform';
    const projectName = 'test-project';

    it('should wrap executeTerraform with logging group', async () => {
      mockExec.exec.mockResolvedValue(0);

      await executeTerraformWithTfcmt(
        tfcmtPath,
        'plan',
        projectName,
        workingDir
      );

      expect(mockCore.startGroup).toHaveBeenCalledWith(
        'Executing terraform plan for project: test-project'
      );
      expect(mockCore.endGroup).toHaveBeenCalled();
    });

    it('should call endGroup even if execution fails', async () => {
      mockExec.exec.mockResolvedValueOnce(0); // terraform init
      mockExec.exec.mockResolvedValueOnce(1); // terraform fails

      await expect(
        executeTerraformWithTfcmt(tfcmtPath, 'plan', projectName, workingDir)
      ).rejects.toThrow();

      expect(mockCore.startGroup).toHaveBeenCalled();
      expect(mockCore.endGroup).toHaveBeenCalled();
    });

    it('should pass through additional arguments', async () => {
      mockExec.exec.mockResolvedValue(0);

      const additionalArgs = ['-var=foo=bar'];
      await executeTerraformWithTfcmt(
        tfcmtPath,
        'plan',
        projectName,
        workingDir,
        additionalArgs
      );

      expect(mockExec.exec).toHaveBeenCalledWith(
        tfcmtPath,
        expect.arrayContaining(['-var=foo=bar']),
        expect.any(Object)
      );
    });

    it('should pass through plan file path for apply command', async () => {
      mockExec.exec.mockResolvedValue(0);

      const planFilePath = '/path/to/tfplan';
      await executeTerraformWithTfcmt(
        tfcmtPath,
        'apply',
        projectName,
        workingDir,
        [],
        planFilePath
      );

      expect(mockExec.exec).toHaveBeenCalledWith(
        tfcmtPath,
        expect.arrayContaining([planFilePath]),
        expect.any(Object)
      );
    });
  });

  describe('validateTerraformInstalled', () => {
    it('should validate terraform is installed', async () => {
      mockExec.exec.mockResolvedValue(0);

      await expect(validateTerraformInstalled()).resolves.not.toThrow();

      expect(mockExec.exec).toHaveBeenCalledWith('terraform', ['version']);
      expect(mockCore.info).toHaveBeenCalledWith(
        'Validating Terraform installation...'
      );
    });

    it('should throw error when terraform is not installed', async () => {
      mockExec.exec.mockRejectedValue(new Error('Command not found'));

      await expect(validateTerraformInstalled()).rejects.toThrow(
        'Terraform is not installed or not available in PATH'
      );
    });

    it('should throw error when terraform version check fails', async () => {
      mockExec.exec.mockRejectedValue(new Error('Permission denied'));

      await expect(validateTerraformInstalled()).rejects.toThrow(
        'Terraform is not installed or not available in PATH'
      );
    });
  });
});
