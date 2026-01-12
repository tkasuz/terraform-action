/**
 * Artifact management for storing and retrieving Terraform plan files
 */

import * as fs from 'node:fs';
import { DefaultArtifactClient } from '@actions/artifact';
import * as core from '@actions/core';

/**
 * Uploads a Terraform plan file as a GitHub Actions artifact
 *
 * @param planFilePath - Absolute path to the plan file
 * @param projectName - Name of the project (used for artifact naming)
 * @returns Artifact name
 *
 * @remarks
 * Artifact will be named: tfplan-<projectName>
 * Artifacts are available within the same workflow run for download
 */
export async function uploadPlanFile(planFilePath: string, projectName: string): Promise<string> {
  const artifactName = `tfplan-${projectName}`;

  // Verify file exists
  if (!fs.existsSync(planFilePath)) {
    throw new Error(`Plan file not found: ${planFilePath}`);
  }

  core.info(`Uploading plan file as artifact: ${artifactName}`);

  try {
    const artifactClient = new DefaultArtifactClient();
    const uploadResult = await artifactClient.uploadArtifact(
      artifactName,
      [planFilePath],
      process.cwd(),
      {
        retentionDays: 90, // Keep plan files for 90 days
      }
    );

    core.info(
      `Plan file uploaded successfully. Artifact ID: ${uploadResult.id}, Size: ${uploadResult.size} bytes`
    );
    return artifactName;
  } catch (error) {
    throw new Error(
      `Failed to upload plan file artifact: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Downloads a Terraform plan file from GitHub Actions artifacts
 *
 * @param projectName - Name of the project
 * @param downloadPath - Directory to download the plan file to
 * @returns Path to the downloaded plan file
 *
 * @remarks
 * Downloads artifact named: tfplan-<projectName>
 * Returns the full path to the downloaded plan file
 */
export async function downloadPlanFile(projectName: string, downloadPath: string): Promise<string> {
  const artifactName = `tfplan-${projectName}`;

  core.info(`Downloading plan file artifact: ${artifactName}`);

  try {
    const artifactClient = new DefaultArtifactClient();

    // First, get the artifact to find its ID
    const artifact = await artifactClient.getArtifact(artifactName);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactName}`);
    }

    // Download the artifact by ID
    const downloadResult = await artifactClient.downloadArtifact(artifact.artifact.id, {
      path: downloadPath,
    });

    core.info(`Plan file downloaded to: ${downloadResult.downloadPath}`);

    // Return the path to the actual plan file
    // The artifact contains the plan file with name tfplan-<projectName>
    const planFileName = `tfplan-${projectName}`;
    const planFilePath = `${downloadResult.downloadPath}/${planFileName}`;

    if (!fs.existsSync(planFilePath)) {
      throw new Error(`Downloaded plan file not found at expected path: ${planFilePath}`);
    }

    return planFilePath;
  } catch (error) {
    throw new Error(
      `Failed to download plan file artifact: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
