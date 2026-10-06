export interface PlanPageInfo {
  /** Send as `before` for the previous page; null when there is none. */
  startCursor?: string;
  /** Send as `after` for the next page; null when there is none. */
  endCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** The window the search covered, as an ISO-8601 duration; null for a declined plan. */
  searchWindowUsed?: string;
}
