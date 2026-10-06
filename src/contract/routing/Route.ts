export interface Route {
  gtfsId: string;
  shortName?: string;
  longName?: string;
  /** Hex without `#`; null when the feed has none. */
  color?: string;
  /** Hex without `#`; null when the feed has none. */
  textColor?: string;
}
