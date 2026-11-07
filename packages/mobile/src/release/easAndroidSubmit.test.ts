import { readFileSync } from 'fs';
import { join } from 'path';

const EAS_SUBMIT_ENV_VAR = '$GOOGLE_SERVICE_ACCOUNT_KEY_PATH';

type EasSubmitAndroid = {
  serviceAccountKeyPath: string;
};

type EasSubmitProfile = {
  android?: EasSubmitAndroid;
};

type EasJson = {
  submit: {
    preview: EasSubmitProfile;
    production: EasSubmitProfile;
  };
};

describe('eas.json Android submit credentials', () => {
  const easJsonPath = join(__dirname, '../../eas.json');
  const raw = readFileSync(easJsonPath, 'utf8');
  const eas = JSON.parse(raw) as EasJson;

  it('uses GOOGLE_SERVICE_ACCOUNT_KEY_PATH for every Android submit profile', () => {
    expect(eas.submit.preview.android?.serviceAccountKeyPath).toBe(EAS_SUBMIT_ENV_VAR);
    expect(eas.submit.production.android?.serviceAccountKeyPath).toBe(EAS_SUBMIT_ENV_VAR);
  });

  it('does not reference another product Play credentials path', () => {
    expect(raw).not.toMatch(/tankroom/i);
    expect(raw).not.toMatch(/\/Users\/admin\/Dev\/Noctusoft\//);
  });
});
