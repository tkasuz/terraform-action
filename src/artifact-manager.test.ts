/**
 * Unit tests for artifact management
 */

import * as core from '@actions/core';
import { uploadPlanFile, downloadPlanFile } from './artifact-manager';
import { DefaultArtifactClient } from '@actions/artifact';

// Mock fs module
jest.mock('node:fs', () => {
  const actualFs = jest.requireActual('node:fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
  };
});

// Mock the modules
jest.mock('@actions/core');
jest.mock('@actions/artifact');

// Import the mocked fs module
import * as fs from 'node:fs';

describe('artifact-manager', () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

  // Create a mock artifact client
  const mockArtifactClient = {
    uploadArtifact: jest.fn(),
    downloadArtifact: jest.fn(),
    getArtifact: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock the DefaultArtifactClient constructor
    (DefaultArtifactClient as jest.MockedClass<typeof DefaultArtifactClient>).mockImplementation(
      () => mockArtifactClient as any
    );
  });

  describe('uploadPlanFile', () => {
    const planFilePath = '/path/to/tfplan-production';
    const projectName = 'production';

    it('should upload plan file successfully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockArtifactClient.uploadArtifact.mockResolvedValue({
        id: 123,
        size: 1024,
      } as any);

      const result = await uploadPlanFile(planFilePath, projectName);

      expect(mockExistsSync).toHaveBeenCalledWith(planFilePath);
      expect(mockArtifactClient.uploadArtifact).toHaveBeenCalledWith(
        'tfplan-production',
        [planFilePath],
        process.cwd(),
        {
          retentionDays: 90,
        }
      );
      expect(result).toBe('tfplan-production');
    });

    it('should throw error when plan file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(uploadPlanFile(planFilePath, projectName)).rejects.toThrow(
        `Plan file not found: ${planFilePath}`
      );

      expect(mockArtifactClient.uploadArtifact).not.toHaveBeenCalled();
    });

    it('should throw error when upload fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockArtifactClient.uploadArtifact.mockRejectedValue(new Error('Network error'));

      await expect(uploadPlanFile(planFilePath, projectName)).rejects.toThrow(
        'Failed to upload plan file artifact: Network error'
      );
    });

    it('should log upload information', async () => {
      mockExistsSync.mockReturnValue(true);
      mockArtifactClient.uploadArtifact.mockResolvedValue({
        id: 456,
        size: 2048,
      } as any);

      await uploadPlanFile(planFilePath, projectName);

      expect(mockCore.info).toHaveBeenCalledWith(
        'Uploading plan file as artifact: tfplan-production'
      );
      expect(mockCore.info).toHaveBeenCalledWith(
        'Plan file uploaded successfully. Artifact ID: 456, Size: 2048 bytes'
      );
    });

    it('should handle different project names', async () => {
      mockExistsSync.mockReturnValue(true);
      mockArtifactClient.uploadArtifact.mockResolvedValue({
        id: 123,
        size: 1024,
      } as any);

      await uploadPlanFile('/path/to/tfplan-staging', 'staging');

      expect(mockArtifactClient.uploadArtifact).toHaveBeenCalledWith(
        'tfplan-staging',
        ['/path/to/tfplan-staging'],
        process.cwd(),
        {
          retentionDays: 90,
        }
      );
    });

    it('should use 90 days retention period', async () => {
      mockExistsSync.mockReturnValue(true);
      mockArtifactClient.uploadArtifact.mockResolvedValue({
        id: 123,
        size: 1024,
      } as any);

      await uploadPlanFile(planFilePath, projectName);

      const uploadCall = mockArtifactClient.uploadArtifact.mock.calls[0];
      expect(uploadCall[3]).toEqual({ retentionDays: 90 });
    });
  });

  describe('downloadPlanFile', () => {
    const projectName = 'production';
    const downloadPath = '/tmp/downloads';

    it('should download plan file successfully', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue({
        artifact: {
          id: 123,
          name: 'tfplan-production',
        },
      } as any);
      mockArtifactClient.downloadArtifact.mockResolvedValue({
        downloadPath: '/tmp/downloads',
      } as any);
      mockExistsSync.mockReturnValue(true);

      const result = await downloadPlanFile(projectName, downloadPath);

      expect(mockArtifactClient.getArtifact).toHaveBeenCalledWith('tfplan-production');
      expect(mockArtifactClient.downloadArtifact).toHaveBeenCalledWith(123, {
        path: downloadPath,
      });
      expect(result).toBe('/tmp/downloads/tfplan-production');
    });

    it('should throw error when artifact is not found', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue(null);

      await expect(downloadPlanFile(projectName, downloadPath)).rejects.toThrow(
        'Artifact not found: tfplan-production'
      );

      expect(mockArtifactClient.downloadArtifact).not.toHaveBeenCalled();
    });

    it('should throw error when downloaded file does not exist', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue({
        artifact: {
          id: 123,
          name: 'tfplan-production',
        },
      } as any);
      mockArtifactClient.downloadArtifact.mockResolvedValue({
        downloadPath: '/tmp/downloads',
      } as any);
      mockExistsSync.mockReturnValue(false);

      await expect(downloadPlanFile(projectName, downloadPath)).rejects.toThrow(
        'Downloaded plan file not found at expected path: /tmp/downloads/tfplan-production'
      );
    });

    it('should throw error when download fails', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue({
        artifact: {
          id: 123,
          name: 'tfplan-production',
        },
      } as any);
      mockArtifactClient.downloadArtifact.mockRejectedValue(new Error('Network timeout'));

      await expect(downloadPlanFile(projectName, downloadPath)).rejects.toThrow(
        'Failed to download plan file artifact: Network timeout'
      );
    });

    it('should log download information', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue({
        artifact: {
          id: 123,
          name: 'tfplan-production',
        },
      } as any);
      mockArtifactClient.downloadArtifact.mockResolvedValue({
        downloadPath: '/tmp/downloads',
      } as any);
      mockExistsSync.mockReturnValue(true);

      await downloadPlanFile(projectName, downloadPath);

      expect(mockCore.info).toHaveBeenCalledWith(
        'Downloading plan file artifact: tfplan-production'
      );
      expect(mockCore.info).toHaveBeenCalledWith('Plan file downloaded to: /tmp/downloads');
    });

    it('should handle different project names', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue({
        artifact: {
          id: 456,
          name: 'tfplan-staging',
        },
      } as any);
      mockArtifactClient.downloadArtifact.mockResolvedValue({
        downloadPath: '/tmp/downloads',
      } as any);
      mockExistsSync.mockReturnValue(true);

      const result = await downloadPlanFile('staging', downloadPath);

      expect(mockArtifactClient.getArtifact).toHaveBeenCalledWith('tfplan-staging');
      expect(result).toBe('/tmp/downloads/tfplan-staging');
    });

    it('should construct correct plan file path', async () => {
      mockArtifactClient.getArtifact.mockResolvedValue({
        artifact: {
          id: 123,
          name: 'tfplan-production',
        },
      } as any);
      mockArtifactClient.downloadArtifact.mockResolvedValue({
        downloadPath: '/custom/path',
      } as any);
      mockExistsSync.mockReturnValue(true);

      const result = await downloadPlanFile(projectName, '/custom/path');

      expect(result).toBe('/custom/path/tfplan-production');
    });

    it('should throw error when getArtifact fails', async () => {
      mockArtifactClient.getArtifact.mockRejectedValue(new Error('API error'));

      await expect(downloadPlanFile(projectName, downloadPath)).rejects.toThrow(
        'Failed to download plan file artifact: API error'
      );
    });
  });
});
