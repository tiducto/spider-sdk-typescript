import type { RealTimeEstimate } from './RealTimeEstimate.ts';

export interface LegTime {
  scheduledTime: string;
  /** Null without realtime. */
  estimated?: RealTimeEstimate;
}
