export interface Route {
  gtfsId: string;
  /** Null when the feed has none. */
  shortName: string | null;
  /** Null when the feed has none. */
  longName: string | null;
  /** Hex without `#`; null when the feed has none. */
  color: string | null;
  /** Hex without `#`; null when the feed has none. */
  textColor: string | null;
}
