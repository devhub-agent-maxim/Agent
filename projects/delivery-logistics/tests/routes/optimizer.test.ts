import { RouteOptimizer, DistanceMatrix } from '../../src/routes/optimizer';
import { DeliveryStop } from '../../src/maps/types';

describe('RouteOptimizer', () => {
  const optimizer = new RouteOptimizer();

  const stops: DeliveryStop[] = [
    { id: 'A', address: '1 Main St' },
    { id: 'B', address: '2 Main St' },
    { id: 'C', address: '3 Main St' },
    { id: 'D', address: '4 Main St' },
  ];

  // A→B: 1km, A→C: 10km, A→D: 5km
  // B→C: 2km, B→D: 8km
  // C→D: 3km
  const matrix: DistanceMatrix = {
    A: { A: {distanceMeters:0,durationSeconds:0}, B: {distanceMeters:1000,durationSeconds:120}, C: {distanceMeters:10000,durationSeconds:1200}, D: {distanceMeters:5000,durationSeconds:600} },
    B: { A: {distanceMeters:1000,durationSeconds:120}, B: {distanceMeters:0,durationSeconds:0}, C: {distanceMeters:2000,durationSeconds:240}, D: {distanceMeters:8000,durationSeconds:960} },
    C: { A: {distanceMeters:10000,durationSeconds:1200}, B: {distanceMeters:2000,durationSeconds:240}, C: {distanceMeters:0,durationSeconds:0}, D: {distanceMeters:3000,durationSeconds:360} },
    D: { A: {distanceMeters:5000,durationSeconds:600}, B: {distanceMeters:8000,durationSeconds:960}, C: {distanceMeters:3000,durationSeconds:360}, D: {distanceMeters:0,durationSeconds:0} },
  };

  it('returns single stop unchanged', () => {
    const result = optimizer.optimize([stops[0]], matrix);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
  });

  it('starts from the first stop', () => {
    const result = optimizer.optimize(stops, matrix);
    expect(result[0].id).toBe('A');
  });

  it('visits all stops', () => {
    const result = optimizer.optimize(stops, matrix);
    expect(result).toHaveLength(4);
    const ids = result.map(s => s.id).sort();
    expect(ids).toEqual(['A', 'B', 'C', 'D']);
  });

  it('nearest-neighbour: A→B→C→D order', () => {
    // From A, nearest is B (1km). From B, nearest unvisited is C (2km). From C, nearest unvisited is D (3km).
    const result = optimizer.optimize(stops, matrix);
    expect(result.map(s => s.id)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('buildSegments creates correct segments', () => {
    const ordered = [stops[0], stops[1], stops[2]];
    const segments = optimizer.buildSegments(ordered, matrix);
    expect(segments).toHaveLength(2);
    expect(segments[0].from.id).toBe('A');
    expect(segments[0].to.id).toBe('B');
    expect(segments[0].distanceMeters).toBe(1000);
  });

  it('totalDistance sums all segments', () => {
    const ordered = optimizer.optimize(stops, matrix);
    const segments = optimizer.buildSegments(ordered, matrix);
    const total = optimizer.totalDistance(segments);
    // A→B (1000) + B→C (2000) + C→D (3000) = 6000
    expect(total).toBe(6000);
  });
});
