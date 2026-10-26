/** A WGS84 point. */
export interface PlanCoordinateInput {
  /** Latitude in degrees, -90 to 90; rejected, never clamped. Rounded to 7 decimals (about 1 cm), ties away from zero. */
  latitude: number;
  /** Longitude in degrees, -180 to 180; rejected, never clamped. Rounded to 7 decimals (about 1 cm), ties away from zero. */
  longitude: number;
}
