/** Wheelchair preferences. */
export interface WheelchairPreferencesInput {
  /** Plan for a wheelchair user: ride only trips the feed marks wheelchair accessible, board and alight only at stops it marks accessible (no information counts as not accessible), and walk strongly avoiding steps and ways mapped as not wheelchair accessible. The feed's accessibility data limits what this guarantees. */
  enabled?: boolean;
}
