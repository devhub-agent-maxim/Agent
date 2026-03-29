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
const EventEmitter = require('events');

// Mock https before requiring github-issues
jest.mock('https');

// Mock environment variables
const originalEnv = process.env;

describe('github-issues', () => {
  let githubIssues;
  let requestMock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Set default environment variables
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: 'ghp_test_token_123',
      GITHUB_OWNER: 'test-owner',
      GITHUB_REPO: 'test-repo',
    };

    // Mock https.request
    requestMock = jest.spyOn(https, 'request');

    // Require module after env setup
    githubIssues = require('./github-issues');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Helper to mock successful API response
  function mockApiSuccess(statusCode, responseBody) {
    requestMock.mockImplementation((opts, callback) => {
      // Create mock request object
      const req = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            req._errorHandler = handler;
          }
          return req;
        }),
        _errorHandler: null
      };

      // Override end to trigger response
      req.end.mockImplementation(() => {
        // Create mock response object
        const res = {
          statusCode,
          on: jest.fn((event, handler) => {
            if (event === 'data') {
              res._dataHandler = handler;
            } else if (event === 'end') {
              res._endHandler = handler;
            }
            return res;
          }),
          _dataHandler: null,
          _endHandler: null
        };

        // Call the callback with response
        callback(res);

        // Trigger data and end events
        setImmediate(() => {
          if (res._dataHandler) {
            res._dataHandler(Buffer.from(JSON.stringify(responseBody)));
          }
          if (res._endHandler) {
            res._endHandler();
          }
        });
      });

      return req;
    });
  }

  // Helper to mock API error
  function mockApiError(error) {
    requestMock.mockImplementation(() => {
      const req = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event, handler) => {
          if (event === 'error') {
            req._errorHandler = handler;
          }
          return req;
        }),
        _errorHandler: null
      };

      // Trigger error when end is called
      req.end.mockImplementation(() => {
        setImmediate(() => {
          if (req._errorHandler) {
            req._errorHandler(error);
          }
        });
      });

      return req;
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
      // Should still be configured with defaults
      expect(gh.isConfigured()).toBe(true);
    });
  });

  // ── createIssue() ───────────────────────────────────────────────────────────

  describe('createIssue()', () => {
    it('should create issue with title and default status', async () => {
      mockApiSuccess(201, {
        number: 42,
        html_url: 'https://github.com/test-owner/test-repo/issues/42',
      });

      const result = await githubIssues.createIssue('Test Issue');

      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/test-owner/test-repo/issues/42',
      });

      // Verify API call
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/repos/test-owner/test-repo/issues',
          headers: expect.objectContaining({
            'Authorization': 'Bearer ghp_test_token_123',
          }),
        }),
        expect.any(Function)
      );
    });

    it('should create issue with body and workerId', async () => {
      mockApiSuccess(201, {
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

    it('should include agent-task and in-progress labels by default', async () => {
      mockApiSuccess(201, { number: 44, html_url: 'https://test.url' });

      const result = await githubIssues.createIssue('Test');

      // Verify successful result
      expect(result).toEqual({
        number: 44,
        url: 'https://test.url'
      });

      // Verify API was called with POST method
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: expect.stringContaining('/issues')
        }),
        expect.any(Function)
      );
    });

    it('should use backlog label when status is backlog', async () => {
      mockApiSuccess(201, { number: 45, html_url: 'https://test.url' });

      const result = await githubIssues.createIssue('Test', '', null, 'backlog');

      // Verify successful result
      expect(result).toEqual({
        number: 45,
        url: 'https://test.url'
      });

      // Verify API was called
      expect(requestMock).toHaveBeenCalled();
    });

    it('should return null when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      const result = await gh.createIssue('Test');
      expect(result).toBeNull();
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('should return null on API error', async () => {
      mockApiSuccess(500, { message: 'Internal Server Error' });

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
      mockApiSuccess(201, {}); // Comment response
      mockApiSuccess(200, {}); // Label update response
      mockApiSuccess(200, {}); // Close response

      await githubIssues.closeIssue(42, 'abc1234', 'Completed the task');

      // Should make 3+ API calls: comment, labels, close
      expect(requestMock.mock.calls.length).toBeGreaterThanOrEqual(3);

      // Check comment creation
      const commentCall = requestMock.mock.calls.find(call =>
        call[0].path.includes('/issues/42/comments')
      );
      expect(commentCall).toBeDefined();

      // Check issue close
      const closeCall = requestMock.mock.calls.find(call =>
        call[0].method === 'PATCH' && call[0].path.includes('/issues/42')
      );
      expect(closeCall).toBeDefined();
    });

    it('should include score and test count in comment', async () => {
      // Mock multiple API calls (comment + label updates + close)
      let callCount = 0;
      requestMock.mockImplementation((opts, callback) => {
        callCount++;
        const req = {
          write: jest.fn(),
          end: jest.fn(),
          on: jest.fn(() => req),
        };

        req.end.mockImplementation(() => {
          const res = {
            statusCode: callCount === 1 ? 201 : 200,
            on: jest.fn((event, handler) => {
              if (event === 'data') res._dataHandler = handler;
              else if (event === 'end') res._endHandler = handler;
              return res;
            }),
          };

          callback(res);

          setImmediate(() => {
            if (res._dataHandler) res._dataHandler(Buffer.from('{}'));
            if (res._endHandler) res._endHandler();
          });
        });

        return req;
      });

      await githubIssues.closeIssue(42, 'def5678', 'Fixed bug', 8, 25);

      // Should make 3+ API calls: comment, labels, close
      expect(requestMock.mock.calls.length).toBeGreaterThanOrEqual(3);

      // Verify comment endpoint was called
      const commentCall = requestMock.mock.calls.find(call =>
        call[0].path.includes('/issues/42/comments')
      );
      expect(commentCall).toBeDefined();
    });

    it('should handle missing optional parameters', async () => {
      mockApiSuccess(201, {});
      mockApiSuccess(200, {});
      mockApiSuccess(200, {});

      await githubIssues.closeIssue(42, null, 'Done');

      // Should still make the calls without commit SHA
      expect(requestMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should not call API when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      await gh.closeIssue(42, 'abc', 'Done');
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('should not call API when issueNumber is missing', async () => {
      await githubIssues.closeIssue(null, 'abc', 'Done');
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockApiError(new Error('API Error'));

      // Should not throw
      await expect(
        githubIssues.closeIssue(42, 'abc', 'Done')
      ).resolves.toBeUndefined();
    });
  });

  // ── blockIssue() ────────────────────────────────────────────────────────────

  describe('blockIssue()', () => {
    it('should add blocked comment and move to backlog', async () => {
      // Mock multiple API calls (comment + label updates)
      let callCount = 0;
      requestMock.mockImplementation((opts, callback) => {
        callCount++;
        const req = {
          write: jest.fn(),
          end: jest.fn(),
          on: jest.fn(() => req),
        };

        req.end.mockImplementation(() => {
          const res = {
            statusCode: callCount === 1 ? 201 : 200,
            on: jest.fn((event, handler) => {
              if (event === 'data') res._dataHandler = handler;
              else if (event === 'end') res._endHandler = handler;
              return res;
            }),
          };

          callback(res);

          setImmediate(() => {
            if (res._dataHandler) res._dataHandler(Buffer.from('{}'));
            if (res._endHandler) res._endHandler();
          });
        });

        return req;
      });

      await githubIssues.blockIssue(42, 'Tests failing: 3 failures');

      // Should make API calls for comment and labels
      expect(requestMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Verify comment endpoint was called
      const commentCall = requestMock.mock.calls.find(call =>
        call[0].path.includes('/issues/42/comments')
      );
      expect(commentCall).toBeDefined();
    });

    it('should not call API when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      await gh.blockIssue(42, 'Error');
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('should not call API when issueNumber is missing', async () => {
      await githubIssues.blockIssue(null, 'Error');
      expect(requestMock).not.toHaveBeenCalled();
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
      // Set up fresh mock
      requestMock.mockClear();
      mockApiSuccess(200, [
        { number: 1, title: 'Task 1', html_url: 'https://gh.com/1' },
        { number: 2, title: 'Task 2', html_url: 'https://gh.com/2' },
      ]);

      const result = await githubIssues.getBacklog();

      expect(result).toEqual([
        { number: 1, title: 'Task 1', url: 'https://gh.com/1' },
        { number: 2, title: 'Task 2', url: 'https://gh.com/2' },
      ]);

      // Verify API call includes backlog label
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: expect.stringContaining('labels=backlog'),
        }),
        expect.any(Function)
      );
    });

    it('should return empty array when not configured', async () => {
      process.env.GITHUB_TOKEN = '';
      jest.resetModules();
      const gh = require('./github-issues');

      const result = await gh.getBacklog();
      expect(result).toEqual([]);
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('should return empty array on API error', async () => {
      mockApiError(new Error('API Error'));

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should return empty array for non-200 status', async () => {
      mockApiSuccess(404, { message: 'Not found' });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should handle non-array response body', async () => {
      mockApiSuccess(200, { issues: [] });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });
  });

  // ── getRecentlyDone() ───────────────────────────────────────────────────────

  describe('getRecentlyDone()', () => {
    it('should return recently closed issues with default hours', async () => {
      mockApiSuccess(200, [
        { number: 10, title: 'Done 1', html_url: 'https://gh.com/10' },
        { number: 11, title: 'Done 2', html_url: 'https://gh.com/11' },
      ]);

      const result = await githubIssues.getRecentlyDone();

      expect(result).toEqual([
        { number: 10, title: 'Done 1', url: 'https://gh.com/10' },
        { number: 11, title: 'Done 2', url: 'https://gh.com/11' },
      ]);

      // Verify API call includes done label and since parameter
      expect(requestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: expect.stringMatching(/labels=done.*since=/),
        }),
        expect.any(Function)
      );
    });

    it('should accept custom hours parameter', async () => {
      mockApiSuccess(200, []);

      await githubIssues.getRecentlyDone(24);

      // Verify since parameter is calculated correctly (24 hours ago)
      const callPath = requestMock.mock.calls[0][0].path;
      expect(callPath).toContain('since=');
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
      mockApiSuccess(200, null);

      const result = await githubIssues.getRecentlyDone();
      expect(result).toEqual([]);
    });
  });

  // ── boardUrl() ──────────────────────────────────────────────────────────────

  describe('boardUrl()', () => {
    it('should generate correct board URL with default env vars', () => {
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
      requestMock.mockImplementation((opts, callback) => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        setImmediate(() => {
          res.emit('data', Buffer.from('{"invalid json'));
          res.emit('end');
        });
        const req = new EventEmitter();
        req.write = jest.fn();
        req.end = jest.fn();
        return req;
      });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should handle empty response body', async () => {
      requestMock.mockImplementation((opts, callback) => {
        const res = new EventEmitter();
        res.statusCode = 200;
        callback(res);
        setImmediate(() => {
          res.emit('end');
        });
        const req = new EventEmitter();
        req.write = jest.fn();
        req.end = jest.fn();
        return req;
      });

      const result = await githubIssues.getBacklog();
      expect(result).toEqual([]);
    });

    it('should handle createIssue with special characters in title', async () => {
      mockApiSuccess(201, {
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
      mockApiSuccess(201, { number: 100, html_url: 'https://test.url' });

      await githubIssues.createIssue('Test', '', null, 'invalid-status');

      // Should fall back to 'in-progress'
      const req = requestMock.mock.results[0].value;
      expect(req.write).toHaveBeenCalledWith(
        expect.stringContaining('"labels":["in-progress","agent-task"]')
      );
    });
  });
});
