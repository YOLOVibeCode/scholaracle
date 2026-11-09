import {
  FAKE_PORTAL_SKYWARD_ASSIGNMENTS,
  FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH,
  buildM402SkywardGradebookBody,
} from '../../../scraper-core/dist/index.js';
import { SCRIPT_BASE } from './config';

const SKYWARD_NAV =
  `<nav>` +
  `<a href="${FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH}">Gradebook</a>` +
  `<a href="/skyward/attendance">Attendance</a>` +
  `<a href="/skyward/schedule">Schedule</a>` +
  `</nav>`;

export function skywardShell(inner: string): string {
  return (
    `<div id="schoolName">Sample District</div>` +
    `<div class="sf_headerName">Jamie Student</div>` +
    `<div id="skyward-root">${SKYWARD_NAV}<div id="skyward-section">${inner}</div></div>`
  );
}

export function skywardGradebookPage(silentCni: string): string {
  const json = JSON.stringify(FAKE_PORTAL_SKYWARD_ASSIGNMENTS);
  return (
    `<script type="application/json" id="slc-skyward-assignments">${json}</script>` +
    skywardShell(buildM402SkywardGradebookBody()) +
    `<script src="${SCRIPT_BASE}/skyward-gradebook.js" data-silent="${silentCni}" defer></script>`
  );
}

export { FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH };
