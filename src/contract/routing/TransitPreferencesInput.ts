import type { AlightPreferencesInput } from './AlightPreferencesInput.ts';
import type { BoardPreferencesInput } from './BoardPreferencesInput.ts';
import type { TimetablePreferencesInput } from './TimetablePreferencesInput.ts';
import type { TransferPreferencesInput } from './TransferPreferencesInput.ts';
import type { TransitFilterInput } from './TransitFilterInput.ts';

export interface TransitPreferencesInput {
  alight?: AlightPreferencesInput;
  board?: BoardPreferencesInput;
  filters?: TransitFilterInput[];
  timetable?: TimetablePreferencesInput;
  transfer?: TransferPreferencesInput;
}
