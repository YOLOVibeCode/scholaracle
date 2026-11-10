/**
 * R1 — what a student needs to do an assignment, derived from the work-pack
 * partition (no fetch per item). Mirrors WorkPack's link classification.
 */

import type { ICourseMaterial } from '@scholaracle/contracts';
import { deriveTaskNeeds } from './taskNeeds';

const HOSTED: ICourseMaterial = {
  externalId: 'lab-safety',
  title: 'Lab Safety Handout',
  type: 'handout',
  fileName: 'lab-safety.pdf',
  assetId: 'asset-lab-safety',
  contentHash: 'hash-1',
  assignmentExternalId: 'a5',
};

const PUBLIC_LINK: ICourseMaterial = {
  externalId: 'khan',
  title: 'Khan Academy - Cell Division',
  type: 'video',
  url: 'https://www.khanacademy.org/science/ap-biology/cell-cycle',
  linkAccessibility: 'public',
  assignmentExternalId: 'a5',
};

const LOGIN_LINK: ICourseMaterial = {
  externalId: 'portal-doc',
  title: 'Worksheet on the portal',
  type: 'document',
  url: 'https://files.example.edu/worksheet',
  linkAccessibility: 'authenticated',
  assignmentExternalId: 'a5',
};

const CAPTURED: ICourseMaterial = {
  externalId: 'spark',
  title: 'SparkNotes',
  type: 'link',
  url: 'https://www.sparknotes.com/lit/mocking/',
  linkAccessibility: 'public',
  extractedText: 'Scout Finch narrates…',
  assignmentExternalId: 'a9',
};

const LMS = 'https://school.instructure.com/courses/bio101/assignments/cell-division';

describe('deriveTaskNeeds', () => {
  it.each<[string, readonly ICourseMaterial[], string | undefined, readonly string[]]>([
    ['hosted file → saved_file', [HOSTED], undefined, ['saved_file']],
    [
      'downloadUrl only still counts as saved',
      [
        {
          ...HOSTED,
          assetId: undefined,
          contentHash: undefined,
          downloadUrl: 'https://api.example/asset',
        },
      ],
      undefined,
      ['saved_file'],
    ],
    ['authenticated link → school_login', [LOGIN_LINK], undefined, ['school_login']],
    [
      'school portal host → school_login',
      [
        {
          ...PUBLIC_LINK,
          url: 'https://school.instructure.com/files/1',
          linkAccessibility: undefined,
        },
      ],
      undefined,
      ['school_login'],
    ],
    ['public link → internet', [PUBLIC_LINK], undefined, ['internet']],
    ['captured page is readable offline → nothing needed', [CAPTURED], undefined, []],
    [
      'saved file + public link, fixed order',
      [PUBLIC_LINK, HOSTED],
      undefined,
      ['saved_file', 'internet'],
    ],
    [
      'all three, deduplicated and ordered',
      [PUBLIC_LINK, LOGIN_LINK, HOSTED, PUBLIC_LINK],
      LMS,
      ['saved_file', 'school_login', 'internet'],
    ],
    ['only the LMS page → school_login', [], LMS, ['school_login']],
    [
      'saved file + LMS page → saved_file only (portal is not the only way in)',
      [HOSTED],
      LMS,
      ['saved_file'],
    ],
    ['nothing at all → []', [], undefined, []],
  ])('%s', (_name, materials, lmsUrl, expected) => {
    expect(deriveTaskNeeds(materials, lmsUrl)).toEqual(expected);
  });
});
