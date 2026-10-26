export interface TripGeometry {
  /** Encoded polyline (precision 1e6). */
  points: string;
  /** Number of points. */
  length: number;
}
