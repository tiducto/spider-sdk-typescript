/** The search work this stream used; ends the stream. `stoppedBy` is `targetResults` (enough itineraries sent), `maxWindow` (the whole window searched), `directOnly` (a direct-only plan, which searches no transit) or `rejected` (a declined plan, one with no stops in range or no transit connection included); new values may be added. */
export interface PlanStreamDoneEvent {
  /** Search iterations used. */
  iterations: number;
  /** Seconds of the window searched. */
  windowSeconds: number;
  /** Itineraries sent. */
  resultCount: number;
  /** Why the stream stopped. */
  stoppedBy: string;
}
