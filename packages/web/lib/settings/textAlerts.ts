/**
 * Alerts by text, as Settings shows them. Texts go out only when the account has a mobile
 * number, the opt-in box is ticked and the "SMS Notifications" switch is on (the API's
 * `accountTextsOn`). Pure: no React, no network.
 */

/** The three things on the Settings page that decide whether alerts go by text. */
export interface ITextAlertControls {
  readonly phone: string;
  /** The opt-in box under Profile. */
  readonly smsConsent: boolean;
  /** The "SMS Notifications" switch under Notifications. */
  readonly smsNotifications: boolean;
}

/**
 * What the switch becomes when the opt-in box changes. The box says "text me grade and
 * assignment alerts", so ticking it turns the switch on and unticking it turns the switch
 * off. The switch can still be turned off on its own afterwards, to pause texts.
 */
export function smsSwitchAfterOptIn(ticked: boolean): boolean {
  return ticked;
}

/**
 * What to say under the switch when it is on and no text can go out, or null when there is
 * nothing to say. The switch never ticks the opt-in for the person: consent is theirs to give.
 */
export function textAlertsNote(controls: ITextAlertControls): string | null {
  if (!controls.smsNotifications) return null;
  const needsNumber = controls.phone.trim() === '';
  const needsOptIn = !controls.smsConsent;
  if (needsNumber && needsOptIn) {
    return 'No texts will be sent yet: add your mobile number and tick the text opt-in under Profile.';
  }
  if (needsOptIn) return 'No texts will be sent yet: tick the text opt-in under Profile.';
  if (needsNumber) return 'No texts will be sent yet: add your mobile number under Profile.';
  return null;
}
