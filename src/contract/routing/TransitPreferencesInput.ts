import type { AlightPreferencesInput } from './AlightPreferencesInput.ts';
import type { BoardPreferencesInput } from './BoardPreferencesInput.ts';
import type { TransferPreferencesInput } from './TransferPreferencesInput.ts';
import type { TransitFilterInput } from './TransitFilterInput.ts';

/** Transit preferences. */
export interface TransitPreferencesInput {
  transfer?: TransferPreferencesInput | unknown;
  board?: BoardPreferencesInput | unknown;
  alight?: AlightPreferencesInput | unknown;
  /** Routes or agencies to leave out of the search. */
  filters?: TransitFilterInput[];
}
