import { ALERT_CHANNELS, channelText, joinNames, toggleInList } from './common';

describe('sharing common helpers', () => {
  it('lists the three channels in display order with labels', () => {
    expect(ALERT_CHANNELS.map((c) => c.value)).toEqual(['email', 'push', 'sms']);
    expect(channelText('sms')).toBe('Text');
    expect(channelText('push')).toBe('Push');
  });

  it('toggles an item in a list without reordering the rest', () => {
    expect(toggleInList(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleInList(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(toggleInList([], 1)).toEqual([1]);
  });

  it('joins names in prose', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ava'])).toBe('Ava');
    expect(joinNames(['Ava', 'Christian'])).toBe('Ava and Christian');
    expect(joinNames(['Ava', 'Christian', 'Gideon'])).toBe('Ava, Christian and Gideon');
  });
});
