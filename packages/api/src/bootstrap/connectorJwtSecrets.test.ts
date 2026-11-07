import { assertConnectorJwtSecretDistinctFromUserSecret } from '@scholaracle/auth';

describe('API connector JWT secret policy', () => {
  it('fails fast when connector and user secrets are equal', () => {
    expect(() =>
      assertConnectorJwtSecretDistinctFromUserSecret('same-value', 'same-value')
    ).toThrow(/CONNECTOR_JWT_SECRET/);
  });
});
