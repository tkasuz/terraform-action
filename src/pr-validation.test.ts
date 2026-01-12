/**
 * Unit tests for Pull Request requirements validation
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import {
  getPullRequestInfo,
  validateRequirements,
  validateEventType,
  getPRNumberFromContext,
  getCommentBodyFromContext,
} from './pr-validation';
import type { PullRequestInfo } from './types';

// Mock the @actions modules
jest.mock('@actions/core');
jest.mock('@actions/github');

describe('pr-validation', () => {
  const mockCore = core as jest.Mocked<typeof core>;
  const mockGithub = github as jest.Mocked<typeof github>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPullRequestInfo', () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn(),
          listReviews: jest.fn(),
        },
      },
    };

    beforeEach(() => {
      mockGithub.getOctokit.mockReturnValue(mockOctokit as any);
    });

    it('should fetch PR information successfully', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            user: { login: 'reviewer1' },
            state: 'APPROVED',
          },
        ],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result).toEqual({
        number: 123,
        owner: 'owner',
        repo: 'repo',
        isFork: false,
        mergeable: true,
        approved: true,
        sha: 'abc123',
      });
    });

    it('should detect fork PRs', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 2, fork: true },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result.isFork).toBe(true);
    });

    it('should detect fork PRs when repo IDs differ', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 2, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result.isFork).toBe(true);
    });

    it('should handle null mergeable status', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: null,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result.mergeable).toBe(false);
    });

    it('should detect approved PRs with single approval', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            user: { login: 'reviewer1' },
            state: 'APPROVED',
          },
        ],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result.approved).toBe(true);
    });

    it('should use latest review per user', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            user: { login: 'reviewer1' },
            state: 'APPROVED',
          },
          {
            user: { login: 'reviewer1' },
            state: 'CHANGES_REQUESTED',
          },
        ],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      // Latest review from reviewer1 is CHANGES_REQUESTED
      expect(result.approved).toBe(false);
    });

    it('should not approve when changes are requested', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            user: { login: 'reviewer1' },
            state: 'APPROVED',
          },
          {
            user: { login: 'reviewer2' },
            state: 'CHANGES_REQUESTED',
          },
        ],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result.approved).toBe(false);
    });

    it('should not approve when no reviews exist', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      } as any);

      const result = await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(result.approved).toBe(false);
    });

    it('should log PR information', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: {
          number: 123,
          head: {
            sha: 'abc123',
            repo: { id: 1, fork: false },
          },
          base: {
            repo: { id: 1 },
          },
          mergeable: true,
        },
      } as any);

      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [],
      } as any);

      await getPullRequestInfo('token', 'owner', 'repo', 123);

      expect(mockCore.info).toHaveBeenCalledWith('Fetching PR #123 information...');
      expect(mockCore.info).toHaveBeenCalledWith(
        'PR #123 status: isFork=false, mergeable=true, approved=false'
      );
    });
  });

  describe('validateRequirements', () => {
    const createMockPR = (overrides?: Partial<PullRequestInfo>): PullRequestInfo => ({
      number: 123,
      owner: 'owner',
      repo: 'repo',
      isFork: false,
      mergeable: true,
      approved: true,
      sha: 'abc123',
      ...overrides,
    });

    it('should pass when all requirements are met', () => {
      const pr = createMockPR();

      expect(() => {
        validateRequirements(pr, ['mergeable', 'approved']);
      }).not.toThrow();
    });

    it('should pass when PR is mergeable and only mergeable is required', () => {
      const pr = createMockPR({ approved: false });

      expect(() => {
        validateRequirements(pr, ['mergeable']);
      }).not.toThrow();
    });

    it('should pass when no requirements specified', () => {
      const pr = createMockPR({ mergeable: false, approved: false });

      expect(() => {
        validateRequirements(pr, []);
      }).not.toThrow();
    });

    it('should throw when mergeable requirement is not met', () => {
      const pr = createMockPR({ mergeable: false });

      expect(() => {
        validateRequirements(pr, ['mergeable']);
      }).toThrow('PR requirements not met');
      expect(() => {
        validateRequirements(pr, ['mergeable']);
      }).toThrow('PR is not mergeable');
    });

    it('should throw when approved requirement is not met', () => {
      const pr = createMockPR({ approved: false });

      expect(() => {
        validateRequirements(pr, ['approved']);
      }).toThrow('PR requirements not met');
      expect(() => {
        validateRequirements(pr, ['approved']);
      }).toThrow('PR is not approved');
    });

    it('should throw when multiple requirements are not met', () => {
      const pr = createMockPR({ mergeable: false, approved: false });

      expect(() => {
        validateRequirements(pr, ['mergeable', 'approved']);
      }).toThrow('PR requirements not met');
      expect(() => {
        validateRequirements(pr, ['mergeable', 'approved']);
      }).toThrow('PR is not mergeable');
      expect(() => {
        validateRequirements(pr, ['mergeable', 'approved']);
      }).toThrow('PR is not approved');
    });
  });

  describe('validateEventType', () => {
    it('should pass for issue_comment event', () => {
      expect(() => {
        validateEventType('issue_comment');
      }).not.toThrow();
    });

    it('should pass for pull_request event', () => {
      expect(() => {
        validateEventType('pull_request');
      }).not.toThrow();
    });

    it('should throw for other event types', () => {
      expect(() => {
        validateEventType('push');
      }).toThrow('This action is designed for issue_comment or pull_request events');
      expect(() => {
        validateEventType('push');
      }).toThrow('but was triggered by: push');
    });

    it('should throw for workflow_dispatch event', () => {
      expect(() => {
        validateEventType('workflow_dispatch');
      }).toThrow('This action is designed for issue_comment or pull_request events');
    });
  });

  describe('getPRNumberFromContext', () => {
    it('should extract PR number from context', () => {
      const context = {
        payload: {
          issue: {
            number: 123,
          },
        },
      } as typeof github.context;

      const prNumber = getPRNumberFromContext(context);

      expect(prNumber).toBe(123);
    });

    it('should throw when PR number is not available', () => {
      const context = {
        payload: {},
      } as typeof github.context;

      expect(() => {
        getPRNumberFromContext(context);
      }).toThrow('Could not determine PR number from context');
    });

    it('should throw when issue is null', () => {
      const context = {
        payload: {
          issue: null,
        },
      } as any;

      expect(() => {
        getPRNumberFromContext(context);
      }).toThrow('Could not determine PR number from context');
    });
  });

  describe('getCommentBodyFromContext', () => {
    it('should extract comment body from context', () => {
      const context = {
        payload: {
          comment: {
            body: '@terraform plan',
          },
        },
      } as any;

      const commentBody = getCommentBodyFromContext(context);

      expect(commentBody).toBe('@terraform plan');
    });

    it('should throw when comment body is not available', () => {
      const context = {
        payload: {},
      } as any;

      expect(() => {
        getCommentBodyFromContext(context);
      }).toThrow('Could not extract comment body from context');
    });

    it('should throw when comment is null', () => {
      const context = {
        payload: {
          comment: null,
        },
      } as any;

      expect(() => {
        getCommentBodyFromContext(context);
      }).toThrow('Could not extract comment body from context');
    });
  });
});
