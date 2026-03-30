import { printRoute, printError } from '../../src/cli/reporter';
import { OptimizedRoute } from '../../src/maps/types';

describe('reporter', () => {
  let consoleSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prints route summary', () => {
    const route: OptimizedRoute = {
      stops: [
        { id: 'A', address: '1 Main St', label: 'Origin' },
        { id: 'B', address: '2 Main St', label: 'Stop 1' },
      ],
      segments: [
        { from: { id: 'A', address: '1 Main St' }, to: { id: 'B', address: '2 Main St' }, distanceMeters: 5000, durationSeconds: 600 },
      ],
      totalDistanceMeters: 5000,
      totalDurationSeconds: 600,
    };

    printRoute(route);

    const allCalls = consoleSpy.mock.calls.flat().join('\n');
    expect(allCalls).toContain('5.0 km');
    expect(allCalls).toContain('10m');
    expect(allCalls).toContain('Origin');
  });

  it('prints error message', () => {
    printError('something went wrong');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('something went wrong'));
  });
});
