import type { InputField } from './InputField.ts';
import type { RoutingErrorCode } from './RoutingErrorCode.ts';

export interface RoutingError {
  code: RoutingErrorCode;
  description: string;
  inputField?: InputField;
}
