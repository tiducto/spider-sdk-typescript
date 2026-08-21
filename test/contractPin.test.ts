import test from 'node:test';
import assert from 'node:assert/strict';
import * as ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

interface ParsedInterface {
  members: string[];
  extends: string[];
}

function parseInterfaces(filePath: string): Map<string, ParsedInterface> {
  const text = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  const out = new Map<string, ParsedInterface>();
  source.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return;
    const members = node.members
      .filter(ts.isPropertySignature)
      .map((m) => (m.name as ts.Identifier).text);
    const extendsNames: string[] = [];
    for (const clause of node.heritageClauses ?? []) {
      for (const t of clause.types) {
        if (ts.isIdentifier(t.expression)) extendsNames.push(t.expression.text);
      }
    }
    out.set(node.name.text, { members, extends: extendsNames });
  });
  return out;
}

function fieldsOf(map: Map<string, ParsedInterface>, name: string): Set<string> {
  const decl = map.get(name);
  if (!decl) throw new Error(`interface ${name} not found in source`);
  const fields = new Set(decl.members);
  for (const parent of decl.extends) {
    for (const f of fieldsOf(map, parent)) fields.add(f);
  }
  return fields;
}

function schemaFields(fixturePath: string, component: string): Set<string> {
  const doc = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
  };
  const schema = doc.components?.schemas?.[component];
  if (!schema) throw new Error(`${fixturePath} is missing component \`${component}\` — refresh via scripts/generate-contract.sh`);
  return new Set(Object.keys(schema.properties ?? {}));
}

function checkPins(sourceFile: string, fixtureFile: string, pairs: ReadonlyArray<readonly [string, string]>): void {
  const interfaces = parseInterfaces(path.join(ROOT, 'src', sourceFile));
  const fixturePath = path.join(ROOT, 'test/fixtures', fixtureFile);
  const mismatches: string[] = [];
  for (const [component, typeName] of pairs) {
    const spec = schemaFields(fixturePath, component);
    const sdk = fieldsOf(interfaces, typeName);
    const specOnly = [...spec].filter((f) => !sdk.has(f)).sort();
    const sdkOnly = [...sdk].filter((f) => !spec.has(f)).sort();
    if (specOnly.length > 0 || sdkOnly.length > 0) {
      mismatches.push(`${typeName} (${component}): spec-only=${JSON.stringify(specOnly)} sdk-only=${JSON.stringify(sdkOnly)}`);
    }
  }
  assert.deepEqual(mismatches, [], `wire types drifted from ${fixtureFile} — reconcile the SDK types with the contract:\n${mismatches.join('\n')}`);
}

test('stops wire types match stops-openapi', () => {
  checkPins('stops.ts', 'stops-openapi.json', [
    ['StopSearchRequest', 'StopSearchRequestWire'],
    ['StopSearchResponse', 'StopSearchResponseWire'],
    ['StopHit', 'StopHitWire'],
    ['StopSearchError', 'StopSearchErrorWire'],
  ]);
});

test('routes wire types match routes-openapi', () => {
  checkPins('routes.ts', 'routes-openapi.json', [
    ['RouteSearchRequest', 'RouteSearchRequestWire'],
    ['RouteSearchResponse', 'RouteSearchResponseWire'],
    ['RouteHit', 'RouteHitWire'],
    ['RouteSearchError', 'RouteSearchErrorWire'],
  ]);
});

test('realtime wire types match realtime-openapi', () => {
  checkPins('realtime.ts', 'realtime-openapi.json', [
    ['VehiclesResponse', 'VehiclesResponseWire'],
    ['VehicleByTripResponse', 'VehicleByTripResponseWire'],
    ['Vehicle', 'VehicleDtoWire'],
    ['DelaysResponse', 'DelaysResponseWire'],
    ['Delay', 'DelayDtoWire'],
    ['StopTimeUpdate', 'StopTimeUpdateDtoWire'],
    ['AlertsResponse', 'AlertsResponseWire'],
    ['Alert', 'AlertDtoWire'],
    ['ActivePeriod', 'ActivePeriodDtoWire'],
    ['InformedEntity', 'InformedEntityDtoWire'],
  ]);
});
