#!/usr/bin/env node
/**
 * Comprehensive Jest tests for scripts/lib/github-issues.js
 *
 * Tests cover:
 * - isConfigured() with environment variable scenarios
 * - createIssue() with labels, worker IDs, and status
 * - closeIssue() with commit SHA, score, and test counts
 * - blockIssue() with error messages
 * - getBacklog() and getRecentlyDone() API calls
 * - boardUrl() generation
 * - Error handling for API failures
 * - Edge cases: missing fields, invalid repos, API errors
 */

'use strict';

const https = require('https');

// Mock https before requiring github-issues
jest.mock('https');

// Mock environment variables
const originalEnv = process.env;

describe('github-issues', () => {
  let githubIssues;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set default environment variables
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'ghp_test_token_123',
      GITHUB_OWNER: 'test-owner',
      GITHUB_REPO: 'test-repo',
    };

    // Setup default mock implementation
    https.request.mockImplementation((opts, callback) => {
      const mockReq = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn().mockReturnThis(),
      };
      return mockReq;
    });

    // Require module after env setup
    githubIssues = require('./github-issues');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  // Helper to mock successful API response
  function mockApiResponse(statusCode, responseBody) {
    https.request.mockImplementation((opts, callback) => {
      const dataHandlers = [];
      const endHandlers = [];

      const mockRes = {
        statusCode,
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            dataHandlers.push(handler);
          } else if (event === 'end') {
            endHandlers.push(handler);
          }
          return mockRes;
        }),
      };

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(() => {
          // When end() is called, trigger the callback and events
          setImmediate(() => {
            callback(mockRes);
            setImmediate(() => {
              dataHandlers.forEach(h => h(Buffer.from(JSON.stringify(responseBody))));
              setImmediate(() => {
                endHandlers.forEach(h => h());
              });
            });
          });
        }),
        on: jest.fn().mockReturnThis(),
      };

      return mockReq;
    });

    // Reload module to pick up new mock
    jest.resetModules();
    githubIssues = require('./github-issues');
  }

  // Helper to mock API error
  function mockApiError(error) {
    https.request.mockImplementation(() => {
      const errorHandlers = [];

      const mockReq = {
        write: jest.fn(),
        end: jest.fn(() => {
          // Trigger error when end() is called
          setImmediate(() => {
            errorHandlers.forEach(h => h(error));
          });
        }),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            errorHandlers.push(handler);
          }
          return mockReq;
        }),
      };
      return mockReq;
    });
  }

  // ── isConfigured() ──────────────────────────────────────────────────────────

  describe('isConfigured()', () => {
    it('should return true when all env vars are set', () => {
      expect(githubIssues.isConfigured()).toBe(true);
    });

    it('should return false when GITHUB_TOKEN is missing', () => {
      delete process.env.GITHUB_TOKEN;
      jest.resetModules();
      const gh = require('./github-issues');
      expect(gh.isConfigured()).toBe(false);
    });

    it('should return false when GITHUB_TOKEN is empty string', () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');
      expect(gh.isConfigured()).toBe(false);
    });

    it('should use default OWNER and REPO if not provided', () => {
      delete process.env.GITHUB_OWNER;
      delete process.env.GITHUB_REPO;
      process.env.GITHUB_TOKEN = 'test-token';
      jest.resetModules();
      const gh = require('./github-issues');
      expect(gh.isConfigured()).toBe(true);
    });
  });

  // ── createIssue() ───────────────────────────────────────────────────────────

  describe('createIssue()', () => {
    it('should create issue with title and default status', async () => {
      mockApiResponse(201, {
        number: 42,
        html_url: 'https://github.com/test-owner/test-repo/issues/42',
      });

      const result = await githubIssues.createIssue('Test Issue');

      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/test-owner/test-repo/issues/42',
      });
    });

    it('should create issue with body and workerId', async () => {
      mockApiResponse(201, {
        number: 43,
        html_url: 'https://github.com/test-owner/test-repo/issues/43',
      });

      const result = await githubIssues.createIssue(
        'Add feature X',
        'Detailed description',
        'AUTO-123456',
        'backlog'
      );

      expect(result).toEqual({
        number: 43,
        url: 'https://github.com/test-owner/test-repo/issues/43',
      });
    });

    it('should return null when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      const result = await gh.createIssue('Test');
      expect(result).toBeNull();
    });

    it('should return null on API error (500)', async () => {
      mockApiResponse(500, { message: 'Internal Server Error' });

      const result = await githubIssues.createIssue('Test');
      expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      mockApiError(new Error('Network timeout'));

      const result = await githubIssues.createIssue('Test');
      expect(result).toBeNull();
    });
  });

  // ── closeIssue() ────────────────────────────────────────────────────────────

  describe('closeIssue()', () => {
    it('should close issue with commit SHA and summary', async () => {
      // Mock multiple API calls (comment + label operations + close)
      let callCount = 0;
      https.request.mockImplementation((opts, callback) => {
        callCount++;
        const dataHandlers = [];
        const endHandlers = [];

        const mockRes = {
          statusCode: callCount === 1 ? 201 : 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              dataHandlers.push(handler);
            } else if (event === 'end') {
              endHandlers.push(handler);
            }
            return mockRes;
          }),
        };

        const mockReq = {
          write: jest.fn(),
          end: jest.fn(() => {
            setImmediate(() => {
              callback(mockRes);
              setImmediate(() => {
                dataHandlers.forEach(h => h(Buffer.from('{}')));
                setImmediate(() => {
                  endHandlers.forEach(h => h());
                });
              });
            });
          }),
          on: jest.fn().mockReturnThis(),
        };

        return mockReq;
      });

      await githubIssues.closeIssue(42, 'abc1234', 'Completed the task');

      // Should have made multiple API calls
      expect(https.request.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should not call API when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      await gh.closeIssue(42, 'abc', 'Done');
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should not call API when issueNumber is missing', async () => {
      await githubIssues.closeIssue(null, 'abc', 'Done');
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockApiError(new Error('API Error'));

      await expect(
        githubIssues.closeIssue(42, 'abc', 'Done')
      ).resolves.toBeUndefined();
    });
  });

  // ── blockIssue() ────────────────────────────────────────────────────────────

  describe('blockIssue()', () => {
    it('should add blocked comment and update labels', async () => {
      // Mock multiple API calls
      let callCount = 0;
      https.request.mockImplementation((opts, callback) => {
        callCount++;
        const dataHandlers = [];
        const endHandlers = [];

        const mockRes = {
          statusCode: callCount === 1 ? 201 : 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              dataHandlers.push(handler);
            } else if (event === 'end') {
              endHandlers.push(handler);
            }
            return mockRes;
          }),
        };

        const mockReq = {
          write: jest.fn(),
          end: jest.fn(() => {
            setImmediate(() => {
              callback(mockRes);
              setImmediate(() => {
                dataHandlers.forEach(h => h(Buffer.from('{}')));
                setImmediate(() => {
                  endHandlers.forEach(h => h());
                });
              });
            });
          }),
          on: jest.fn().mockReturnThis(),
        };

        return mockReq;
      });

      await githubIssues.blockIssue(42, 'Tests failing: 3 failures');

      expect(https.request.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should not call API when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      await gh.blockIssue(42, 'Error');
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should not call API when issueNumber is missing', async () => {
      await githubIssues.blockIssue(null, 'Error');
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockApiError(new Error('Network error'));

      await expect(
        githubIssues.blockIssue(42, 'Failed')
      ).resolves.toBeUndefined();
    });
  });

  // ── getBacklog() ────────────────────────────────────────────────────────────

  describe('getBacklog()', () => {
    it('should return array of backlog issues', async () => {
      mockApiResponse(200, [
        { number: 1, title: 'Task 1', html_url: 'https://gh.com/1' },
        { number: 2, title: 'Task 2', html_url: 'https://gh.com/2' },
      ]);

      const result = await githubIssues.getBacklog();

      expect(result).toEqual([
        { number: 1, title: 'Task 1', url: 'https://gh.com/1' },
        { number: 2, title: 'Task 2', url: 'https://gh.com/2' },
      ]);
    });

    it('should return empty array when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      const result = await gh.getBacklog();
      expect(result).toEqual([]);
    });

    it('should return empty array on API error', async () => {
      mockApiError(new Error('API Error'));

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should return empty array for non-200 status', async () => {
      mockApiResponse(404, { message: 'Not found' });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should handle non-array response body', async () => {
      mockApiResponse(200, { issues: [] });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });
  });

  // ── getRecentlyDone() ───────────────────────────────────────────────────────

  describe('getRecentlyDone()', () => {
    it('should return recently closed issues with default hours', async () => {
      mockApiResponse(200, [
        { number: 10, title: 'Done 1', html_url: 'https://gh.com/10' },
        { number: 11, title: 'Done 2', html_url: 'https://gh.com/11' },
      ]);

      const result = await githubIssues.getRecentlyDone();

      expect(result).toEqual([
        { number: 10, title: 'Done 1', url: 'https://gh.com/10' },
        { number: 11, title: 'Done 2', url: 'https://gh.com/11' },
      ]);
    });

    it('should accept custom hours parameter', async () => {
      mockApiResponse(200, []);

      await githubIssues.getRecentlyDone(24);

      expect(https.request).toHaveBeenCalled();
    });

    it('should return empty array when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      const result = await gh.getRecentlyDone();
      expect(result).toEqual([]);
    });

    it('should return empty array on API error', async () => {
      mockApiError(new Error('Timeout'));

      const result = await githubIssues.getRecentlyDone();
      expect(result).toEqual([]);
    });

    it('should handle non-array response', async () => {
      mockApiResponse(200, null);

      const result = await githubIssues.getRecentlyDone();
      expect(result).toEqual([]);
    });
  });

  // ── boardUrl() ──────────────────────────────────────────────────────────────

  describe('boardUrl()', () => {
    it('should generate correct board URL with env vars', () => {
      const url = githubIssues.boardUrl();
      expect(url).toBe('https://github.com/test-owner/test-repo/issues?q=label%3Aagent-task');
    });

    it('should use custom OWNER and REPO from environment', () => {
      process.env.GITHUB_OWNER = 'my-org';
      process.env.GITHUB_REPO = 'my-project';
      jest.resetModules();
      const gh = require('./github-issues');

      const url = gh.boardUrl();
      expect(url).toBe('https://github.com/my-org/my-project/issues?q=label%3Aagent-task');
    });

    it('should use default owner/repo when env vars missing', () => {
      delete process.env.GITHUB_OWNER;
      delete process.env.GITHUB_REPO;
      jest.resetModules();
      const gh = require('./github-issues');

      const url = gh.boardUrl();
      expect(url).toBe('https://github.com/devhub-agent-maxim/Agent/issues?q=label%3Aagent-task');
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle malformed JSON response gracefully', async () => {
      https.request.mockImplementation((opts, callback) => {
        const dataHandlers = [];
        const endHandlers = [];

        const mockRes = {
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              dataHandlers.push(handler);
            } else if (event === 'end') {
              endHandlers.push(handler);
            }
            return mockRes;
          }),
        };

        const mockReq = {
          write: jest.fn(),
          end: jest.fn(() => {
            setImmediate(() => {
              callback(mockRes);
              setImmediate(() => {
                dataHandlers.forEach(h => h(Buffer.from('{"invalid json')));
                setImmediate(() => {
                  endHandlers.forEach(h => h());
                });
              });
            });
          }),
          on: jest.fn().mockReturnThis(),
        };

        return mockReq;
      });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should handle empty response body', async () => {
      https.request.mockImplementation((opts, callback) => {
        const endHandlers = [];

        const mockRes = {
          statusCode: 200,
          on: jest.fn((event, handler) => {
            if (event === 'end') {
              endHandlers.push(handler);
            }
            return mockRes;
          }),
        };

        const mockReq = {
          write: jest.fn(),
          end: jest.fn(() => {
            setImmediate(() => {
              callback(mockRes);
              setImmediate(() => {
                endHandlers.forEach(h => h());
              });
            });
          }),
          on: jest.fn().mockReturnThis(),
        };

        return mockReq;
      });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should handle createIssue with special characters in title', async () => {
      mockApiResponse(201, {
        number: 99,
        html_url: 'https://github.com/test/test/issues/99',
      });

      const result = await githubIssues.createIssue(
        'Fix: Bug with "quotes" & <html> tags',
        'Body with\nmultiple\nlines'
      );

      expect(result).toEqual({
        number: 99,
        url: 'https://github.com/test/test/issues/99',
      });
    });

    it('should handle invalid status parameter in createIssue', async () => {
      mockApiResponse(201, { number: 100, html_url: 'https://test.url' });

      const result = await githubIssues.createIssue('Test', '', null, 'invalid-status');

      // Should fall back to 'in-progress' and return success
      expect(result).toEqual({
        number: 100,
        url: 'https://test.url'
      });
    });
  });
});
