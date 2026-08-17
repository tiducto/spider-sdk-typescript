import type { TransitFilterSelectInput } from './TransitFilterSelectInput.ts';

export interface TransitFilterInput {
  exclude?: TransitFilterSelectInput[];
  include?: TransitFilterSelectInput[];
}
