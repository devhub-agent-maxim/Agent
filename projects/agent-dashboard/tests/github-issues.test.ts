import { getGitHubIssuesKanban, getGitHubRepoInfo } from '../src/lib/github-issues';
import { execSync } from 'child_process';

// Mock child_process
jest.mock('child_process');
const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('GitHub Issues Integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getGitHubRepoInfo', () => {
    it('should parse HTTPS GitHub URL correctly', () => {
      mockedExecSync.mockReturnValue('https://github.com/owner/repo.git\n');

      const result = getGitHubRepoInfo('/fake/path');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo'
      });
    });

    it('should parse SSH GitHub URL correctly', () => {
      mockedExecSync.mockReturnValue('git@github.com:owner/repo.git\n');

      const result = getGitHubRepoInfo('/fake/path');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo'
      });
    });

    it('should parse HTTPS URL without .git suffix', () => {
      mockedExecSync.mockReturnValue('https://github.com/owner/repo\n');

      const result = getGitHubRepoInfo('/fake/path');

      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo'
      });
    });

    it('should return null if git command fails', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      const result = getGitHubRepoInfo('/fake/path');

      expect(result).toBeNull();
    });

    it('should return null for invalid GitHub URL', () => {
      mockedExecSync.mockReturnValue('https://gitlab.com/owner/repo.git\n');

      const result = getGitHubRepoInfo('/fake/path');

      expect(result).toBeNull();
    });
  });

  describe('getGitHubIssuesKanban', () => {
    it('should categorize issues correctly', async () => {
      const openIssues = [
        {
          number: 1,
          title: 'Issue 1',
          labels: [{ name: 'bug' }],
          url: 'https://github.com/owner/repo/issues/1'
        },
        {
          number: 2,
          title: 'Issue 2',
          labels: [{ name: 'in progress' }],
          url: 'https://github.com/owner/repo/issues/2'
        },
        {
          number: 3,
          title: 'Issue 3',
          labels: [{ name: 'enhancement' }],
          url: 'https://github.com/owner/repo/issues/3'
        }
      ];

      const closedIssues = [
        {
          number: 4,
          title: 'Issue 4',
          labels: [{ name: 'bug' }],
          url: 'https://github.com/owner/repo/issues/4'
        }
      ];

      mockedExecSync
        .mockReturnValueOnce(JSON.stringify(openIssues))
        .mockReturnValueOnce(JSON.stringify(closedIssues));

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.backlog).toHaveLength(2);
      expect(result.inProgress).toHaveLength(1);
      expect(result.done).toHaveLength(1);

      expect(result.backlog[0].number).toBe(1);
      expect(result.backlog[1].number).toBe(3);
      expect(result.inProgress[0].number).toBe(2);
      expect(result.done[0].number).toBe(4);
    });

    it('should handle in-progress label variations', async () => {
      const openIssues = [
        {
          number: 1,
          title: 'Issue 1',
          labels: [{ name: 'in-progress' }],
          url: 'https://github.com/owner/repo/issues/1'
        },
        {
          number: 2,
          title: 'Issue 2',
          labels: [{ name: 'In Progress' }],
          url: 'https://github.com/owner/repo/issues/2'
        }
      ];

      mockedExecSync
        .mockReturnValueOnce(JSON.stringify(openIssues))
        .mockReturnValueOnce(JSON.stringify([]));

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.inProgress).toHaveLength(2);
      expect(result.backlog).toHaveLength(0);
    });

    it('should handle empty responses', async () => {
      mockedExecSync
        .mockReturnValueOnce(JSON.stringify([]))
        .mockReturnValueOnce(JSON.stringify([]));

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.backlog).toHaveLength(0);
      expect(result.inProgress).toHaveLength(0);
      expect(result.done).toHaveLength(0);
    });

    it('should handle gh CLI errors gracefully', async () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('gh CLI not found');
      });

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.backlog).toHaveLength(0);
      expect(result.inProgress).toHaveLength(0);
      expect(result.done).toHaveLength(0);
    });

    it('should handle issues without labels', async () => {
      const openIssues = [
        {
          number: 1,
          title: 'Issue 1',
          labels: [],
          url: 'https://github.com/owner/repo/issues/1'
        }
      ];

      mockedExecSync
        .mockReturnValueOnce(JSON.stringify(openIssues))
        .mockReturnValueOnce(JSON.stringify([]));

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.backlog).toHaveLength(1);
      expect(result.backlog[0].labels).toHaveLength(0);
    });

    it('should set correct column property', async () => {
      const openIssues = [
        {
          number: 1,
          title: 'Backlog Issue',
          labels: [],
          url: 'https://github.com/owner/repo/issues/1'
        },
        {
          number: 2,
          title: 'In Progress Issue',
          labels: [{ name: 'in progress' }],
          url: 'https://github.com/owner/repo/issues/2'
        }
      ];

      const closedIssues = [
        {
          number: 3,
          title: 'Done Issue',
          labels: [],
          url: 'https://github.com/owner/repo/issues/3'
        }
      ];

      mockedExecSync
        .mockReturnValueOnce(JSON.stringify(openIssues))
        .mockReturnValueOnce(JSON.stringify(closedIssues));

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.backlog[0].column).toBe('backlog');
      expect(result.inProgress[0].column).toBe('in-progress');
      expect(result.done[0].column).toBe('done');
    });

    it('should preserve label names', async () => {
      const openIssues = [
        {
          number: 1,
          title: 'Issue 1',
          labels: [
            { name: 'bug' },
            { name: 'high-priority' },
            { name: 'needs-review' }
          ],
          url: 'https://github.com/owner/repo/issues/1'
        }
      ];

      mockedExecSync
        .mockReturnValueOnce(JSON.stringify(openIssues))
        .mockReturnValueOnce(JSON.stringify([]));

      const result = await getGitHubIssuesKanban('owner', 'repo');

      expect(result.backlog[0].labels).toEqual(['bug', 'high-priority', 'needs-review']);
    });
  });
});
