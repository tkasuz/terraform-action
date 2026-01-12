/**
 * Pull Request requirements validation
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import type { PullRequestInfo, Requirement } from './types';

/**
 * Fetches pull request information from GitHub API
 *
 * @param token - GitHub token for API access
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Pull request information
 */
export async function getPullRequestInfo(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestInfo> {
  const octokit = github.getOctokit(token);

  core.info(`Fetching PR #${prNumber} information...`);

  // Fetch PR details
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Check if PR is from a fork
  const isFork = pr.head.repo?.fork || pr.head.repo?.id !== pr.base.repo.id;

  // Get mergeable status
  const mergeable = pr.mergeable ?? false;

  // Fetch reviews to check approval status
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Check if PR is approved
  // A PR is approved if it has at least one approval and no pending changes requested
  const latestReviewsByUser = new Map<string, string>();
  for (const review of reviews) {
    if (review.user && review.state) {
      latestReviewsByUser.set(review.user.login, review.state);
    }
  }

  const hasApproval = Array.from(latestReviewsByUser.values()).some(
    (state) => state === 'APPROVED'
  );
  const hasChangesRequested = Array.from(latestReviewsByUser.values()).some(
    (state) => state === 'CHANGES_REQUESTED'
  );

  const approved = hasApproval && !hasChangesRequested;

  core.info(
    `PR #${prNumber} status: isFork=${isFork}, mergeable=${mergeable}, approved=${approved}`
  );

  return {
    number: prNumber,
    owner,
    repo,
    isFork,
    mergeable,
    approved,
    sha: pr.head.sha,
  };
}

/**
 * Validates PR against requirements
 *
 * @param pr - Pull request information
 * @param requirements - Array of requirements to validate
 * @throws Error if any requirement is not met
 */
export function validateRequirements(pr: PullRequestInfo, requirements: Requirement[]): void {
  const failures: string[] = [];

  for (const requirement of requirements) {
    switch (requirement) {
      case 'mergeable':
        if (!pr.mergeable) {
          failures.push('PR is not mergeable (conflicts or failing checks)');
        }
        break;

      case 'approved':
        if (!pr.approved) {
          failures.push('PR is not approved');
        }
        break;
    }
  }

  if (failures.length > 0) {
    throw new Error(`PR requirements not met:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  }
}

/**
 * Validates that the event is an issue_comment event
 *
 * @param eventName - GitHub event name
 * @throws Error if event is not issue_comment
 */
export function validateEventType(eventName: string): void {
  if (eventName !== 'issue_comment' && eventName !== 'pull_request') {
    throw new Error(
      `This action is designed for issue_comment or pull_request events, but was triggered by: ${eventName}`
    );
  }
}

/**
 * Extracts PR number from the GitHub context
 *
 * @param context - GitHub context
 * @returns PR number
 * @throws Error if PR number cannot be determined
 */
export function getPRNumberFromContext(context: typeof github.context): number {
  const prNumber = context.payload.issue?.number;

  if (!prNumber) {
    throw new Error(
      'Could not determine PR number from context. ' +
        'Ensure this action is triggered by an issue_comment event on a pull request.'
    );
  }

  return prNumber;
}

/**
 * Gets the comment body from GitHub context
 *
 * @param context - GitHub context
 * @returns Comment body text
 * @throws Error if comment body cannot be found
 */
export function getCommentBodyFromContext(context: typeof github.context): string {
  const commentBody = context.payload.comment?.body;

  if (!commentBody) {
    throw new Error('Could not extract comment body from context');
  }

  return commentBody;
}
