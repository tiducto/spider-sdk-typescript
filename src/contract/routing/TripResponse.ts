import type { GraphQLError } from './GraphQLError.ts';
import type { TripData } from './TripData.ts';

export interface TripResponse {
  data?: TripData;
  errors?: GraphQLError[];
}
