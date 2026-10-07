export interface Route {
  gtfsId: string;
  /** Null when the feed has none. */
  shortName: string;
  /** Null when the feed has none. */
  longName: string;
  /** Hex without `#`; null when the feed has none. */
  color: string;
  /** Hex without `#`; null when the feed has none. */
  textColor: string;
}
