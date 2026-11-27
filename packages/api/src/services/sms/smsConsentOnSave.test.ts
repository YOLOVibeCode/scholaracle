import {
  accountSmsConsentAfterSave,
  smsConsentWithdrawnBySave,
  storedAccountSmsConsent,
  type IAccountSmsConsent,
  type ISmsConsentSave,
} from './smsConsentOnSave';

const FIRST = '+15125550141';
const SECOND = '+15125550142';

const ticked = (phone: string = FIRST): IAccountSmsConsent => ({ phone, consent: true });
const unticked = (phone: string = FIRST): IAccountSmsConsent => ({ phone, consent: false });
/** An account with no number. The box can still be stored as ticked. */
const NO_NUMBER: IAccountSmsConsent = { phone: undefined, consent: false };
const NO_NUMBER_TICKED: IAccountSmsConsent = { phone: undefined, consent: true };

/** A save that mentions neither the number nor the box. */
const SILENT: ISmsConsentSave = { phone: undefined, phoneSent: false, consent: undefined };

describe('storedAccountSmsConsent', () => {
  it('reads the number as E.164 and the box as ticked only when it is', () => {
    expect(storedAccountSmsConsent({ phone: '(512) 555-0141', smsConsent: true })).toEqual(
      ticked(FIRST)
    );
    expect(storedAccountSmsConsent({ phone: FIRST, smsConsent: false })).toEqual(unticked(FIRST));
    expect(storedAccountSmsConsent({ phone: FIRST })).toEqual(unticked(FIRST));
  });

  it('counts an account with no number as having none, however that is stored', () => {
    expect(storedAccountSmsConsent({})).toEqual(NO_NUMBER);
    expect(storedAccountSmsConsent({ phone: null })).toEqual(NO_NUMBER);
    expect(storedAccountSmsConsent({ phone: '' })).toEqual(NO_NUMBER);
    expect(storedAccountSmsConsent({ phone: '   ', smsConsent: true })).toEqual(NO_NUMBER_TICKED);
  });

  it('counts a stored value that is not a number as none', () => {
    expect(storedAccountSmsConsent({ phone: 'ask me', smsConsent: true })).toEqual(
      NO_NUMBER_TICKED
    );
  });
});

describe('accountSmsConsentAfterSave', () => {
  it('keeps the account as it is when the save mentions neither the number nor the box', () => {
    expect(accountSmsConsentAfterSave(ticked(), SILENT)).toEqual(ticked());
    expect(accountSmsConsentAfterSave(unticked(), SILENT)).toEqual(unticked());
  });

  it('takes the box from the save when the save says it', () => {
    expect(accountSmsConsentAfterSave(ticked(), { ...SILENT, consent: false })).toEqual(unticked());
    expect(accountSmsConsentAfterSave(unticked(), { ...SILENT, consent: true })).toEqual(ticked());
  });

  it('takes the number from the save only when the save sent one', () => {
    expect(
      accountSmsConsentAfterSave(unticked(), { phone: SECOND, phoneSent: true, consent: false })
    ).toEqual(unticked(SECOND));
    expect(
      accountSmsConsentAfterSave(unticked(), { phone: SECOND, phoneSent: false, consent: false })
    ).toEqual(unticked(FIRST));
  });

  it('does not move a consent to another number unless the save says the box is ticked', () => {
    const changed: ISmsConsentSave = { phone: SECOND, phoneSent: true, consent: undefined };
    const removed: ISmsConsentSave = { phone: undefined, phoneSent: true, consent: undefined };

    expect(accountSmsConsentAfterSave(ticked(), changed)).toEqual(unticked(SECOND));
    expect(accountSmsConsentAfterSave(ticked(), removed)).toEqual(NO_NUMBER);
    expect(accountSmsConsentAfterSave(ticked(), { ...changed, consent: true })).toEqual(
      ticked(SECOND)
    );
  });

  it('keeps the consent when the save sends the same number again', () => {
    const same: ISmsConsentSave = { phone: FIRST, phoneSent: true, consent: undefined };

    expect(accountSmsConsentAfterSave(ticked(), same)).toEqual(ticked());
  });
});

describe('smsConsentWithdrawnBySave', () => {
  it('withdraws the consent for the number when the box is unticked', () => {
    expect(smsConsentWithdrawnBySave(ticked(), unticked())).toBe(FIRST);
  });

  it('withdraws the consent for the old number when the number is changed or removed', () => {
    expect(smsConsentWithdrawnBySave(ticked(), ticked(SECOND))).toBe(FIRST);
    expect(smsConsentWithdrawnBySave(ticked(), unticked(SECOND))).toBe(FIRST);
    expect(smsConsentWithdrawnBySave(ticked(), NO_NUMBER)).toBe(FIRST);
  });

  it('withdraws nothing when the box stays ticked for the same number', () => {
    expect(smsConsentWithdrawnBySave(ticked(), ticked())).toBeUndefined();
  });

  it('withdraws nothing when the box was not ticked: a consent given elsewhere stands', () => {
    expect(smsConsentWithdrawnBySave(unticked(), unticked())).toBeUndefined();
    expect(smsConsentWithdrawnBySave(unticked(), unticked(SECOND))).toBeUndefined();
    expect(smsConsentWithdrawnBySave(unticked(), ticked())).toBeUndefined();
  });

  it('withdraws nothing when the account had no number', () => {
    expect(smsConsentWithdrawnBySave(NO_NUMBER_TICKED, ticked(FIRST))).toBeUndefined();
    expect(smsConsentWithdrawnBySave(NO_NUMBER_TICKED, NO_NUMBER)).toBeUndefined();
  });
});
