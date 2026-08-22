import type { RealTimeEstimate } from './RealTimeEstimate.ts';

export interface LegTime {
  scheduledTime: string;
  estimated?: RealTimeEstimate;
}
