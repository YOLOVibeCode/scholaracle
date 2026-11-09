import {
  assertConnectorJwtSecretDistinctFromUserSecret,
  resolveConnectorJwtSecret,
} from './connectorJwtSecrets';

describe('connectorJwtSecrets', () => {
  const priorConnector = process.env['CONNECTOR_JWT_SECRET'];
  const priorJwt = process.env['JWT_SECRET'];

  afterEach(() => {
    if (priorConnector === undefined) delete process.env['CONNECTOR_JWT_SECRET'];
    else process.env['CONNECTOR_JWT_SECRET'] = priorConnector;
    if (priorJwt === undefined) delete process.env['JWT_SECRET'];
    else process.env['JWT_SECRET'] = priorJwt;
  });

  it('throws when secrets are equal', () => {
    expect(() =>
      assertConnectorJwtSecretDistinctFromUserSecret('same-secret', 'same-secret')
    ).toThrow(/CONNECTOR_JWT_SECRET.*different.*JWT_SECRET/);
  });

  it('passes when secrets differ', () => {
    expect(() =>
      assertConnectorJwtSecretDistinctFromUserSecret('user-secret', 'connector-secret')
    ).not.toThrow();
  });

  it('prefers CONNECTOR_JWT_SECRET from env', () => {
    process.env['CONNECTOR_JWT_SECRET'] = 'env-connector';
    process.env['JWT_SECRET'] = 'env-user';
    expect(resolveConnectorJwtSecret()).toBe('env-connector');
  });
});
