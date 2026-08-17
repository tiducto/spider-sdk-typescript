import type { DestinationScooterPolicyInput } from './DestinationScooterPolicyInput.ts';

export interface ScooterRentalPreferencesInput {
  allowedNetworks?: string[];
  bannedNetworks?: string[];
  destinationScooterPolicy?: DestinationScooterPolicyInput;
}
