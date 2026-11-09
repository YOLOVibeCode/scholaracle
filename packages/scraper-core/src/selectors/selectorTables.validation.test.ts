import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import aeriesTable from './aeries.v1.json';
import skywardTable from './skyward.v1.json';
import {
  assertAeriesSelectorTableV1,
  assertSkywardSelectorTableV1,
} from './validateSelectorTables';

describe('selector tables v1', () => {
  it('validates aeries.v1.json and matches aeries.v1.schema.json required keys', () => {
    assertAeriesSelectorTableV1(aeriesTable);
    const schema = JSON.parse(readFileSync(join(__dirname, 'aeries.v1.schema.json'), 'utf8')) as {
      properties?: { selectors?: { required?: string[] } };
    };
    const required = schema.properties?.selectors?.required ?? [];
    const keys = Object.keys(aeriesTable.selectors);
    expect(new Set(keys)).toEqual(new Set(required));
  });

  it('validates skyward.v1.json and matches skyward.v1.schema.json required keys', () => {
    assertSkywardSelectorTableV1(skywardTable);
    const schema = JSON.parse(readFileSync(join(__dirname, 'skyward.v1.schema.json'), 'utf8')) as {
      properties?: { selectors?: { required?: string[] } };
    };
    const required = schema.properties?.selectors?.required ?? [];
    const keys = Object.keys(skywardTable.selectors);
    expect(new Set(keys)).toEqual(new Set(required));
  });
});
