import { SDK_VERSION } from './sdkVersion.ts';

export { SDK_VERSION };

// Sent on every request so the platform can record which SDK + version each client speaks
// (deprecation notices, adoption metrics). Browsers forbid setting User-Agent from fetch, so a
// custom header carries the identity — the same approach as x-spider-contract-version.
export const SDK_HEADER = 'x-spider-sdk';

// `typescript/<full-semver>` — the SDK's own package version, with patch, distinct from the
// major.minor contract version carried by x-spider-contract-version.
export const SDK_IDENTITY = `typescript/${SDK_VERSION}`;
