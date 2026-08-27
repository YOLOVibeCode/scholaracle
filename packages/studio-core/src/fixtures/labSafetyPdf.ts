/** Tiny PDFs for the Emma fixture (studio Open) and v2 hash-replace visualization. */

const PDF_V1_SRC =
  '%PDF-1.1\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
  '3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\n' +
  'trailer<</Root 1 0 R>>\n' +
  '%%EOF\n';

const PDF_V2_SRC = PDF_V1_SRC.replace('%%EOF\n', '% v2\n%%EOF\n');

export const EMMA_LAB_SAFETY_ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
export const EMMA_LAB_SAFETY_HASH = 'demo-demo-emma-ap-bio-lab-safety-hash';
export const EMMA_LAB_SAFETY_HASH_V2 = 'demo-demo-emma-ap-bio-lab-safety-hash-v2';
export const EMMA_LAB_SAFETY_FIXTURE_URL = '/studio/fixtures/lab-safety.pdf';
export const EMMA_LAB_SAFETY_FIXTURE_URL_V2 = '/studio/fixtures/lab-safety-v2.pdf';

export const EMMA_LAB_SAFETY_PDF_V1 = new TextEncoder().encode(PDF_V1_SRC);
export const EMMA_LAB_SAFETY_PDF_V2 = new TextEncoder().encode(PDF_V2_SRC);
