/**
 * Unit tests for tfcmt CLI download and setup logic
 */

import * as os from 'node:os';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { setupTfcmt } from './tfcmt';

// Mock fs module
jest.mock('node:fs', () => {
  const actualFs = jest.requireActual('node:fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    chmodSync: jest.fn(),
  };
});

// Mock the modules
jest.mock('node:os');
jest.mock('@actions/core');
jest.mock('@actions/tool-cache');

// Import the mocked fs module
import * as fs from 'node:fs';

describe('tfcmt', () => {
  const mockOs = os as jest.Mocked<typeof os>;
  const mockCore = core as jest.Mocked<typeof core>;
  const mockTc = tc as jest.Mocked<typeof tc>;
  const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
  const mockChmodSync = fs.chmodSync as jest.MockedFunction<typeof fs.chmodSync>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default mock implementations
    mockChmodSync.mockImplementation(() => undefined);
  });

  describe('setupTfcmt', () => {
    it('should download and setup tfcmt for linux amd64', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      const result = await setupTfcmt('latest');

      expect(mockTc.downloadTool).toHaveBeenCalledWith(
        'https://github.com/suzuki-shunsuke/tfcmt/releases/latest/download/tfcmt_linux_amd64.tar.gz'
      );
      expect(mockTc.extractTar).toHaveBeenCalledWith('/tmp/tfcmt.tar.gz');
      expect(mockChmodSync).toHaveBeenCalledWith('/tmp/extracted/tfcmt', 0o755);
      expect(result).toBe('/tmp/extracted/tfcmt');
    });

    it('should download and setup tfcmt for darwin arm64', async () => {
      mockOs.platform.mockReturnValue('darwin');
      mockOs.arch.mockReturnValue('arm64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      const result = await setupTfcmt('latest');

      expect(mockTc.downloadTool).toHaveBeenCalledWith(
        'https://github.com/suzuki-shunsuke/tfcmt/releases/latest/download/tfcmt_darwin_arm64.tar.gz'
      );
      expect(mockTc.extractTar).toHaveBeenCalledWith('/tmp/tfcmt.tar.gz');
      expect(result).toBe('/tmp/extracted/tfcmt');
    });

    it('should download and setup tfcmt for windows amd64', async () => {
      mockOs.platform.mockReturnValue('win32');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.zip');
      mockTc.extractZip.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      const result = await setupTfcmt('latest');

      expect(mockTc.downloadTool).toHaveBeenCalledWith(
        'https://github.com/suzuki-shunsuke/tfcmt/releases/latest/download/tfcmt_windows_amd64.zip'
      );
      expect(mockTc.extractZip).toHaveBeenCalledWith('/tmp/tfcmt.zip');
      expect(mockChmodSync).not.toHaveBeenCalled(); // No chmod on Windows
      expect(result).toBe('/tmp/extracted/tfcmt.exe');
    });

    it('should download specific version when provided', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      await setupTfcmt('v4.5.0');

      expect(mockTc.downloadTool).toHaveBeenCalledWith(
        'https://github.com/suzuki-shunsuke/tfcmt/releases/download/v4.5.0/tfcmt_linux_amd64.tar.gz'
      );
    });

    it('should handle arm architecture', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('arm');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      await setupTfcmt('latest');

      expect(mockTc.downloadTool).toHaveBeenCalledWith(
        'https://github.com/suzuki-shunsuke/tfcmt/releases/latest/download/tfcmt_linux_arm.tar.gz'
      );
    });

    it('should throw error for unsupported platform', async () => {
      mockOs.platform.mockReturnValue('freebsd' as NodeJS.Platform);
      mockOs.arch.mockReturnValue('x64');

      await expect(setupTfcmt()).rejects.toThrow('Unsupported platform: freebsd');
    });

    it('should throw error for unsupported architecture', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('mips');

      await expect(setupTfcmt()).rejects.toThrow('Unsupported architecture: mips');
    });

    it('should throw error when download fails', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockRejectedValue(new Error('Network error'));

      await expect(setupTfcmt()).rejects.toThrow('Failed to download tfcmt: Network error');
    });

    it('should throw error when extraction fails', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockRejectedValue(new Error('Corrupted archive'));

      await expect(setupTfcmt()).rejects.toThrow('Failed to extract tfcmt: Corrupted archive');
    });

    it('should throw error when binary is not found after extraction', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(false);

      await expect(setupTfcmt()).rejects.toThrow('tfcmt binary not found at /tmp/extracted/tfcmt');
    });

    it('should throw error when chmod fails on unix', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);
      mockChmodSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(setupTfcmt()).rejects.toThrow(
        'Failed to make tfcmt executable: Permission denied'
      );
    });

    it('should log appropriate info messages', async () => {
      mockOs.platform.mockReturnValue('linux');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      await setupTfcmt('latest');

      expect(mockCore.info).toHaveBeenCalledWith('Setting up tfcmt...');
      expect(mockCore.info).toHaveBeenCalledWith(
        expect.stringContaining('Downloading tfcmt from')
      );
      expect(mockCore.info).toHaveBeenCalledWith('Extracting tfcmt...');
      expect(mockCore.info).toHaveBeenCalledWith('tfcmt setup complete: /tmp/extracted/tfcmt');
    });

    it('should use extractZip for windows platform', async () => {
      mockOs.platform.mockReturnValue('win32');
      mockOs.arch.mockReturnValue('x64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.zip');
      mockTc.extractZip.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      await setupTfcmt('latest');

      expect(mockTc.extractZip).toHaveBeenCalledWith('/tmp/tfcmt.zip');
      expect(mockTc.extractTar).not.toHaveBeenCalled();
    });

    it('should use extractTar for non-windows platforms', async () => {
      mockOs.platform.mockReturnValue('darwin');
      mockOs.arch.mockReturnValue('arm64');
      mockTc.downloadTool.mockResolvedValue('/tmp/tfcmt.tar.gz');
      mockTc.extractTar.mockResolvedValue('/tmp/extracted');
      mockExistsSync.mockReturnValue(true);

      await setupTfcmt('latest');

      expect(mockTc.extractTar).toHaveBeenCalledWith('/tmp/tfcmt.tar.gz');
      expect(mockTc.extractZip).not.toHaveBeenCalled();
    });
  });
});
