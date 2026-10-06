/** The search work this stream used; ends the stream. `stoppedBy` is `targetResults` (enough itineraries sent), `maxWindow` (the whole window searched) or `rejected` (a declined plan); new values may be added. */
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
