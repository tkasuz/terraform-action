package github

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/go-github/v57/github"
	"golang.org/x/oauth2"
)

// Client wraps the GitHub API client
type Client struct {
	client *github.Client
	ctx    context.Context
}

// NewClient creates a new GitHub client
func NewClient(ctx context.Context, token string) *Client {
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token},
	)
	tc := oauth2.NewClient(ctx, ts)

	return &Client{
		client: github.NewClient(tc),
		ctx:    ctx,
	}
}

// CommentEvent represents a PR comment event
type CommentEvent struct {
	Owner      string
	Repo       string
	PRNumber   int
	Comment    string
	Author     string
	CommentID  int64
	HeadSHA    string
	BaseBranch string
	HeadBranch string
}

// ParseCommentEvent parses a GitHub issue comment event
func (c *Client) ParseCommentEvent(payload []byte) (*CommentEvent, error) {
	event, err := github.ParseWebHook("issue_comment", payload)
	if err != nil {
		return nil, fmt.Errorf("failed to parse webhook: %w", err)
	}

	commentEvent, ok := event.(*github.IssueCommentEvent)
	if !ok {
		return nil, fmt.Errorf("not an issue comment event")
	}

	// Only process PR comments
	if commentEvent.Issue.PullRequestLinks == nil {
		return nil, fmt.Errorf("comment is not on a pull request")
	}

	// Get PR details
	pr, _, err := c.client.PullRequests.Get(
		c.ctx,
		commentEvent.Repo.Owner.GetLogin(),
		commentEvent.Repo.GetName(),
		commentEvent.Issue.GetNumber(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get PR details: %w", err)
	}

	return &CommentEvent{
		Owner:      commentEvent.Repo.Owner.GetLogin(),
		Repo:       commentEvent.Repo.GetName(),
		PRNumber:   commentEvent.Issue.GetNumber(),
		Comment:    commentEvent.Comment.GetBody(),
		Author:     commentEvent.Comment.User.GetLogin(),
		CommentID:  commentEvent.Comment.GetID(),
		HeadSHA:    pr.Head.GetSHA(),
		BaseBranch: pr.Base.GetRef(),
		HeadBranch: pr.Head.GetRef(),
	}, nil
}

// GetPRInfo retrieves pull request information
func (c *Client) GetPRInfo(owner, repo string, prNumber int) (*PRInfo, error) {
	pr, _, err := c.client.PullRequests.Get(c.ctx, owner, repo, prNumber)
	if err != nil {
		return nil, fmt.Errorf("failed to get PR: %w", err)
	}

	// Get reviews
	reviews, _, err := c.client.PullRequests.ListReviews(c.ctx, owner, repo, prNumber, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get PR reviews: %w", err)
	}

	// Check if approved
	approved := false
	for _, review := range reviews {
		if review.GetState() == "APPROVED" {
			approved = true
			break
		}
	}

	// Get combined status (currently unused but may be needed for future features)
	_, _, err = c.client.Repositories.GetCombinedStatus(
		c.ctx,
		owner,
		repo,
		pr.Head.GetSHA(),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get combined status: %w", err)
	}

	// Get comparison to check if diverged
	comparison, _, err := c.client.Repositories.CompareCommits(
		c.ctx,
		owner,
		repo,
		pr.Base.GetSHA(),
		pr.Head.GetSHA(),
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to compare commits: %w", err)
	}

	return &PRInfo{
		Number:     prNumber,
		Title:      pr.GetTitle(),
		Author:     pr.User.GetLogin(),
		HeadSHA:    pr.Head.GetSHA(),
		BaseSHA:    pr.Base.GetSHA(),
		HeadBranch: pr.Head.GetRef(),
		BaseBranch: pr.Base.GetRef(),
		Mergeable:  pr.GetMergeable(),
		Approved:   approved,
		Diverged:   comparison.GetBehindBy() > 0,
		State:      pr.GetState(),
	}, nil
}

// PRInfo contains pull request information
type PRInfo struct {
	Number     int
	Title      string
	Author     string
	HeadSHA    string
	BaseSHA    string
	HeadBranch string
	BaseBranch string
	Mergeable  bool
	Approved   bool
	Diverged   bool
	State      string
}

// GetChangedFiles retrieves the list of changed files in a PR
func (c *Client) GetChangedFiles(owner, repo string, prNumber int) ([]string, error) {
	var allFiles []string
	opts := &github.ListOptions{PerPage: 100}

	for {
		files, resp, err := c.client.PullRequests.ListFiles(c.ctx, owner, repo, prNumber, opts)
		if err != nil {
			return nil, fmt.Errorf("failed to list PR files: %w", err)
		}

		for _, file := range files {
			allFiles = append(allFiles, file.GetFilename())
		}

		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}

	return allFiles, nil
}

// PostComment posts a comment on a PR
func (c *Client) PostComment(owner, repo string, prNumber int, body string) error {
	comment := &github.IssueComment{
		Body: github.String(body),
	}

	_, _, err := c.client.Issues.CreateComment(c.ctx, owner, repo, prNumber, comment)
	if err != nil {
		return fmt.Errorf("failed to post comment: %w", err)
	}

	return nil
}

// UpdateComment updates an existing comment
func (c *Client) UpdateComment(owner, repo string, commentID int64, body string) error {
	comment := &github.IssueComment{
		Body: github.String(body),
	}

	_, _, err := c.client.Issues.EditComment(c.ctx, owner, repo, commentID, comment)
	if err != nil {
		return fmt.Errorf("failed to update comment: %w", err)
	}

	return nil
}

// CreateStatus creates a commit status
func (c *Client) CreateStatus(owner, repo, sha, state, description, context string) error {
	status := &github.RepoStatus{
		State:       github.String(state),
		Description: github.String(description),
		Context:     github.String(context),
	}

	_, _, err := c.client.Repositories.CreateStatus(c.ctx, owner, repo, sha, status)
	if err != nil {
		return fmt.Errorf("failed to create status: %w", err)
	}

	return nil
}

// MergePR merges a pull request
func (c *Client) MergePR(owner, repo string, prNumber int, commitMessage string) error {
	_, _, err := c.client.PullRequests.Merge(c.ctx, owner, repo, prNumber, commitMessage, nil)
	if err != nil {
		return fmt.Errorf("failed to merge PR: %w", err)
	}

	return nil
}

// DeleteBranch deletes a branch
func (c *Client) DeleteBranch(owner, repo, branch string) error {
	_, err := c.client.Git.DeleteRef(c.ctx, owner, repo, "heads/"+branch)
	if err != nil {
		return fmt.Errorf("failed to delete branch: %w", err)
	}

	return nil
}

// ParseCommand parses a comment to extract terraform command
func ParseCommand(comment string) (command string, project string, args []string) {
	lines := strings.Split(strings.TrimSpace(comment), "\n")
	if len(lines) == 0 {
		return "", "", nil
	}

	firstLine := strings.TrimSpace(lines[0])
	parts := strings.Fields(firstLine)

	if len(parts) < 2 {
		return "", "", nil
	}

	// Expected format: "terraform <command> [options]"
	// or "atlantis <command> [options]"
	if parts[0] != "terraform" {
		return "", "", nil
	}

	command = parts[1]

	// Parse additional arguments
	for i := 2; i < len(parts); i++ {
		if parts[i] == "-d" && i+1 < len(parts) {
			// Directory/project flag
			project = parts[i+1]
			i++
		} else if parts[i] == "-p" && i+1 < len(parts) {
			// Project name flag
			project = parts[i+1]
			i++
		} else {
			args = append(args, parts[i])
		}
	}

	return command, project, args
}
