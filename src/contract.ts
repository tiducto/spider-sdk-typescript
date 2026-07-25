import { SpiderContractMismatchError } from './errors.ts';
import { CONTRACT_VERSION } from './contractVersion.ts';

export { CONTRACT_VERSION };

export const CONTRACT_HEADER = 'x-spider-contract-version';

function major(version: string): string {
  const dot = version.indexOf('.');
  return dot === -1 ? version : version.slice(0, dot);
}

export function checkContract(declaredByGateway: string | null | undefined): void {
  if (declaredByGateway == null) return;
  if (major(CONTRACT_VERSION) !== major(declaredByGateway)) {
    throw new SpiderContractMismatchError(CONTRACT_VERSION, declaredByGateway);
  }
}
