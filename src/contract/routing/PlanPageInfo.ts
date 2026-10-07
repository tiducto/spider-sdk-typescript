export interface PlanPageInfo {
  /** Send as `before` for the previous page; null when there is none, as for a declined, direct-only or unroutable plan. */
  startCursor: string;
  /** Send as `after` for the next page; null when there is none, as for a declined, direct-only or unroutable plan. */
  endCursor: string;
  /** True exactly when `endCursor` is present. */
  hasNextPage: boolean;
  /** True exactly when `startCursor` is present. */
  hasPreviousPage: boolean;
  /** The window the search covered, as an ISO-8601 duration; null when no transit search ran, as for a declined, direct-only or unroutable plan. */
  searchWindowUsed: string;
}
