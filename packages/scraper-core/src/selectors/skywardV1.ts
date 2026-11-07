import raw from './skyward.v1.json';

export type ISkywardSelectorsV1 = typeof raw.selectors;

export const SKYWARD_SELECTORS_V1: ISkywardSelectorsV1 = raw.selectors;
