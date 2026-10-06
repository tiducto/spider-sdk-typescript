import type { TransitFilterSelectInput } from './TransitFilterSelectInput.ts';

/** A filter on the trips the search may ride. */
export interface TransitFilterInput {
  /** Leave out every trip of a route or agency that any of these selectors names. */
  exclude?: TransitFilterSelectInput[];
}
