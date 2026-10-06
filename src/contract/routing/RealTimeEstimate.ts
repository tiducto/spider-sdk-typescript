export interface RealTimeEstimate {
  time: string;
  /** The difference from the schedule, as an ISO-8601 duration; negative when early. */
  delay: string;
}
