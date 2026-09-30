import test from 'node:test';
import assert from 'node:assert/strict';
import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  bikesAllowedFromWire,
  inputFieldFromWire,
  occupancyFromWire,
  realtimeStateFromWire,
  routingErrorCodeFromWire,
  transitModeFromWire,
  wheelchairFromWire,
} from '../src/enums.ts';
import type { InputField, RealtimeState, RoutingErrorCode, TransitMode } from '../src/index.ts';

const ROUTING_CONTRACT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'src/contract/routing');

// The string literals of a generated wire enum (`export type X = | 'A' | 'B' | (string & {})`).
function wireValues(name: string): string[] {
  const file = path.join(ROUTING_CONTRACT, `${name}.ts`);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) values.push(node.literal.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (values.length === 0) throw new Error(`no enum values in ${file}`);
  return values;
}

test('every contract enum value decodes to itself, not UNKNOWN', () => {
  for (const value of [...wireValues('Mode'), ...wireValues('TransitMode')]) assert.equal(transitModeFromWire(value), value);
  for (const value of wireValues('RealtimeState')) assert.equal(realtimeStateFromWire(value), value);
  for (const value of wireValues('RoutingErrorCode')) assert.equal(routingErrorCodeFromWire(value), value);
  for (const value of wireValues('InputField')) assert.equal(inputFieldFromWire(value), value);
  for (const value of wireValues('WheelchairBoarding')) assert.notEqual(wheelchairFromWire(value), 'UNKNOWN');
  for (const value of wireValues('BikesAllowed')) assert.notEqual(bikesAllowedFromWire(value), 'UNKNOWN');
});

test('an unrecognized wire value decodes to UNKNOWN for every enum', () => {
  assert.equal(transitModeFromWire('HOVERCRAFT'), 'UNKNOWN');
  assert.equal(realtimeStateFromWire('DELAYED'), 'UNKNOWN');
  assert.equal(routingErrorCodeFromWire('NEW_CODE'), 'UNKNOWN');
  assert.equal(inputFieldFromWire('FROM_PLACE'), 'UNKNOWN');
  assert.equal(wheelchairFromWire('PARTIAL'), 'UNKNOWN');
  assert.equal(bikesAllowedFromWire('FOLDING_ONLY'), 'UNKNOWN');
  assert.equal(occupancyFromWire('SOMETHING_NEW'), 'UNKNOWN');
  // Inherited Object keys are not enum values.
  assert.equal(transitModeFromWire('toString'), 'UNKNOWN');
});

test('absent and no-information values decode to null', () => {
  for (const decode of [transitModeFromWire, realtimeStateFromWire, inputFieldFromWire, wheelchairFromWire, bikesAllowedFromWire, occupancyFromWire]) {
    assert.equal(decode(null), null);
    assert.equal(decode(undefined), null);
  }
  assert.equal(wheelchairFromWire('NO_INFORMATION'), null);
  assert.equal(bikesAllowedFromWire('NO_INFORMATION'), null);
  assert.equal(occupancyFromWire('NO_DATA_AVAILABLE'), null);
  assert.equal(routingErrorCodeFromWire(undefined), 'UNKNOWN');
});

test('wheelchair and bikes keep their SDK spelling', () => {
  assert.equal(wheelchairFromWire('POSSIBLE'), 'Possible');
  assert.equal(wheelchairFromWire('NOT_POSSIBLE'), 'NotPossible');
  assert.equal(bikesAllowedFromWire('ALLOWED'), 'Allowed');
  assert.equal(bikesAllowedFromWire('NOT_ALLOWED'), 'NotAllowed');
});

// Closed unions: these fail `npm run typecheck` if an enum type ever widens back to `string`.
// @ts-expect-error not a TransitMode
export const notAMode: TransitMode = 'HOVERCRAFT';
// @ts-expect-error not a RealtimeState
export const notAState: RealtimeState = 'DELAYED';
// @ts-expect-error not a RoutingErrorCode
export const notACode: RoutingErrorCode = 'NEW_CODE';
// @ts-expect-error not an InputField
export const notAField: InputField = 'FROM_PLACE';
