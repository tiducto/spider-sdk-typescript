import type { GraphQLError } from './GraphQLError.ts';
import type { StopDeparturesData } from './StopDeparturesData.ts';

export interface StopDeparturesResponse {
  data?: StopDeparturesData;
  errors?: GraphQLError[];
}
