import type { PlanEdge } from './PlanEdge.ts';
import type { PlanPageInfo } from './PlanPageInfo.ts';
import type { RoutingError } from './RoutingError.ts';

export interface PlanConnection {
  edges?: PlanEdge[];
  pageInfo: PlanPageInfo;
  routingErrors: RoutingError[];
  searchDateTime?: string;
}
