import { createAssetStore } from './createAssetStore';
import { LocalAssetStore } from './LocalAssetStore';
import { S3AssetStore } from './S3AssetStore';

describe('createAssetStore', () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it('returns LocalAssetStore by default', () => {
    delete process.env['ASSET_STORE'];
    expect(createAssetStore()).toBeInstanceOf(LocalAssetStore);
  });

  it('throws when ASSET_STORE=relay without NOCTUSOFT_RELAY_API_KEY', () => {
    process.env['ASSET_STORE'] = 'relay';
    delete process.env['NOCTUSOFT_RELAY_API_KEY'];
    expect(() => createAssetStore()).toThrow(/NOCTUSOFT_RELAY_API_KEY/);
  });

  it('returns S3AssetStore when ASSET_STORE=relay and key is set', () => {
    process.env['ASSET_STORE'] = 'relay';
    process.env['NOCTUSOFT_RELAY_API_KEY'] = 'relay-test-key';
    expect(createAssetStore()).toBeInstanceOf(S3AssetStore);
  });
});
