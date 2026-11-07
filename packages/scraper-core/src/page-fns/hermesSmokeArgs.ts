import { AERIES_SELECTORS_V1 } from '../selectors/aeriesV1';
import { SKYWARD_SELECTORS_V1 } from '../selectors/skywardV1';

/** Minimal arguments for Hermes VM smoke runs (empty portal page; no network). */
export function smokeArgsForPageFn(id: string): unknown {
  if (id === 'common.captureSkeleton') {
    return { step: 'hermes.smoke', redact: [] };
  }
  if (id.startsWith('common.')) {
    return [];
  }
  if (id === 'canvas.extractCanvasUser') {
    return ['#meta'];
  }
  if (id === 'canvas.fetchCanvasCourses' || id === 'canvas.fetchCanvasPlannerItems') {
    return [''];
  }
  if (id === 'canvas.fetchCanvasObserveeUserIds') {
    return [];
  }
  if (id === 'canvas.fetchCanvasCoursesForUser') {
    return ['1'];
  }
  if (id === 'canvas.fetchCanvasAnnouncements') {
    return [['1']];
  }
  if (id === 'canvas.fetchFileAsBase64') {
    return ['https://example.com/file'];
  }
  if (id.startsWith('canvas.fetch')) {
    return ['1'];
  }
  if (id.startsWith('canvas.extract')) {
    return [];
  }
  if (id === 'skyward.extractSkywardCourseAssignments') {
    return { selectors: SKYWARD_SELECTORS_V1, courseName: '', coursePeriod: '' };
  }
  if (id === 'skyward.clickSkywardNavLink') {
    return { selectors: SKYWARD_SELECTORS_V1, text: 'Grades' };
  }
  if (id === 'skyward.openSkywardGradeInfo') {
    return { selectors: SKYWARD_SELECTORS_V1, cni: '1', periods: ['1'] };
  }
  if (id.startsWith('skyward.')) {
    return SKYWARD_SELECTORS_V1;
  }
  if (id === 'aeries.selectAeriesCourseOption') {
    return { selectors: AERIES_SELECTORS_V1, value: '0' };
  }
  if (id === 'aeries.switchAeriesStudentByName') {
    return { selectors: AERIES_SELECTORS_V1, name: 'Test Student' };
  }
  if (id.startsWith('aeries.')) {
    return AERIES_SELECTORS_V1;
  }
  if (id === 'assets.fetchAssetInWebView' || id === 'assets.fetchPageInWebView') {
    return ['https://example.com/asset', 4096, 1000];
  }
  throw new Error(`No Hermes smoke args configured for page function "${id}"`);
}
