export interface RealTimeEstimate {
  time: string;
  /** The difference from the schedule, as an ISO-8601 duration such as `PT2M`; negative when early, such as `-PT1M`. */
  delay: string;
}
