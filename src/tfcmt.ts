/**
 * tfcmt CLI download and setup logic
 */

import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Maps Node.js platform to tfcmt platform naming
 */
function getTfcmtPlatform(): string {
  const platform = os.platform();

  switch (platform) {
    case 'linux':
      return 'linux';
    case 'darwin':
      return 'darwin';
    case 'win32':
      return 'windows';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Maps Node.js architecture to tfcmt architecture naming
 */
function getTfcmtArch(): string {
  const arch = os.arch();

  switch (arch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    case 'arm':
      return 'arm';
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
}

/**
 * Downloads and sets up tfcmt CLI
 *
 * @param version - Version to download (default: 'latest')
 * @returns Path to the tfcmt binary
 * @throws Error if download or extraction fails
 *
 * @remarks
 * Downloads tfcmt from GitHub releases, extracts the archive,
 * and makes the binary executable.
 */
export async function setupTfcmt(version = 'latest'): Promise<string> {
  core.info('Setting up tfcmt...');

  const platform = getTfcmtPlatform();
  const arch = getTfcmtArch();

  // Construct download URL
  const fileName = platform === 'windows'
    ? `tfcmt_${platform}_${arch}.zip`
    : `tfcmt_${platform}_${arch}.tar.gz`;

  const url = version === 'latest'
    ? `https://github.com/suzuki-shunsuke/tfcmt/releases/latest/download/${fileName}`
    : `https://github.com/suzuki-shunsuke/tfcmt/releases/download/${version}/${fileName}`;

  core.info(`Downloading tfcmt from ${url}`);

  let downloadPath: string;
  try {
    downloadPath = await tc.downloadTool(url);
  } catch (error) {
    throw new Error(
      `Failed to download tfcmt: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  core.info('Extracting tfcmt...');

  let extractedPath: string;
  try {
    if (platform === 'windows') {
      extractedPath = await tc.extractZip(downloadPath);
    } else {
      extractedPath = await tc.extractTar(downloadPath);
    }
  } catch (error) {
    throw new Error(
      `Failed to extract tfcmt: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Locate binary
  const binaryName = platform === 'windows' ? 'tfcmt.exe' : 'tfcmt';
  const tfcmtPath = path.join(extractedPath, binaryName);

  // Verify binary exists
  if (!fs.existsSync(tfcmtPath)) {
    throw new Error(`tfcmt binary not found at ${tfcmtPath}`);
  }

  // Make executable on Unix-like systems
  if (platform !== 'windows') {
    try {
      fs.chmodSync(tfcmtPath, 0o755);
    } catch (error) {
      throw new Error(
        `Failed to make tfcmt executable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  core.info(`tfcmt setup complete: ${tfcmtPath}`);

  return tfcmtPath;
}
