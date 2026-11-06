/**
 * Every function a recipe or asset host may run inside a portal page, keyed by a
 * stable id.
 *
 * Why: Hermes (the React Native engine) compiles JavaScript to bytecode, so
 * `fn.toString()` returns `function f(a0) { [bytecode] }` and a driver cannot
 * send a function's source to the page at run time. Instead, the source of each
 * function listed here is captured at build time into pageFns.generated.ts
 * (`pnpm --filter @scholaracle/scraper-core page-fns`), and the mobile driver
 * looks the source up by function identity. A function missing from this table
 * fails with PAGE_FN_UNREGISTERED instead of injecting bytecode.
 *
 * Add a page function here whenever a recipe or host calls driver.evaluate()
 * with it, then regenerate. The ids are part of the generated file, so keep them
 * stable.
 */
import * as canvas from '../extractors/canvas/canvas-extractors';
import * as skyward from '../extractors/skyward/skyward-extractors';
import * as aeries from '../extractors/aeries/aeries-extractors';
import { fetchAssetInWebView, fetchPageInWebView } from './asset-fns';
import { getDocumentOuterHtml, isLoginFormShowing } from './common-fns';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPageFn = (...args: any[]) => unknown;

export const PAGE_FNS: Readonly<Record<string, AnyPageFn>> = Object.freeze({
  // Canvas
  'canvas.extractCanvasUser': canvas.extractCanvasUser,
  'canvas.extractCanvasToDoItems': canvas.extractCanvasToDoItems,
  'canvas.extractCanvasUpcomingEvents': canvas.extractCanvasUpcomingEvents,
  'canvas.fetchCanvasCourses': canvas.fetchCanvasCourses,
  'canvas.fetchCanvasObserveeUserIds': canvas.fetchCanvasObserveeUserIds,
  'canvas.fetchCanvasCoursesForUser': canvas.fetchCanvasCoursesForUser,
  'canvas.fetchCanvasPlannerItems': canvas.fetchCanvasPlannerItems,
  'canvas.fetchCanvasCourseAssignments': canvas.fetchCanvasCourseAssignments,
  'canvas.fetchCanvasCourseTeachers': canvas.fetchCanvasCourseTeachers,
  'canvas.fetchCanvasCourseModules': canvas.fetchCanvasCourseModules,
  'canvas.fetchCanvasCourseFiles': canvas.fetchCanvasCourseFiles,
  'canvas.fetchCanvasAnnouncements': canvas.fetchCanvasAnnouncements,
  'canvas.fetchFileAsBase64': canvas.fetchFileAsBase64,
  // Skyward
  'skyward.extractSkywardStudentName': skyward.extractSkywardStudentName,
  'skyward.extractSkywardSchoolName': skyward.extractSkywardSchoolName,
  'skyward.extractSkywardCourseAssignments': skyward.extractSkywardCourseAssignments,
  'skyward.extractSkywardAttendance': skyward.extractSkywardAttendance,
  'skyward.extractSkywardSchedule': skyward.extractSkywardSchedule,
  'skyward.clickSkywardNavLink': skyward.clickSkywardNavLink,
  'skyward.openSkywardGradeInfo': skyward.openSkywardGradeInfo,
  'skyward.isSkywardGradeInfoReady': skyward.isSkywardGradeInfoReady,
  'skyward.closeSkywardDialogs': skyward.closeSkywardDialogs,
  // Aeries
  'aeries.extractAeriesStudentList': aeries.extractAeriesStudentList,
  'aeries.extractAeriesDashboardCourses': aeries.extractAeriesDashboardCourses,
  'aeries.extractAeriesSchedule': aeries.extractAeriesSchedule,
  'aeries.extractAeriesCourseDropdownOptions': aeries.extractAeriesCourseDropdownOptions,
  'aeries.extractAeriesTeacher': aeries.extractAeriesTeacher,
  'aeries.extractAeriesTeacherEmail': aeries.extractAeriesTeacherEmail,
  'aeries.extractAeriesAssignments': aeries.extractAeriesAssignments,
  'aeries.extractAeriesAttendance': aeries.extractAeriesAttendance,
  'aeries.extractAeriesStudentInfo': aeries.extractAeriesStudentInfo,
  'aeries.selectAeriesCourseOption': aeries.selectAeriesCourseOption,
  'aeries.switchAeriesStudentByName': aeries.switchAeriesStudentByName,
  'aeries.isAeriesDashboardReady': aeries.isAeriesDashboardReady,
  'aeries.isAeriesAttendanceReady': aeries.isAeriesAttendanceReady,
  // Assets and common
  'assets.fetchAssetInWebView': fetchAssetInWebView,
  'assets.fetchPageInWebView': fetchPageInWebView,
  'common.getDocumentOuterHtml': getDocumentOuterHtml,
  'common.isLoginFormShowing': isLoginFormShowing,
});
