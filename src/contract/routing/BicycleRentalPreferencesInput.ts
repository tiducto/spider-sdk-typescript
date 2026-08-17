import type { DestinationBicyclePolicyInput } from './DestinationBicyclePolicyInput.ts';

export interface BicycleRentalPreferencesInput {
  allowedNetworks?: string[];
  bannedNetworks?: string[];
  destinationBicyclePolicy?: DestinationBicyclePolicyInput;
}
