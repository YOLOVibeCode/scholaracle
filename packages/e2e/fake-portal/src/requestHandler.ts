import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import {
  buildM402AeriesAttendanceDeferredShell,
  buildM402AeriesClasses,
  buildM402AeriesDashboardDeferredShell,
  buildM402AeriesGradebook,
  buildM402SkywardAttendanceBody,
  buildM402SkywardScheduleBody,
} from '../../../scraper-core/dist/index.js';
import {
  AERIES_ROOT,
  COOKIE_AERIES_STU,
  COOKIE_AUTH,
  DEMO_PASS,
  DEMO_USER,
  SCRIPT_BASE,
} from './config';
import { isAuthorized, parseCookieHeader, readAeriesStudent } from './cookies';
import { buildCspState } from './csp';
import { htmlPage, loginForm } from './html';
import { parseForm, readBody } from './readBody';
import { redirect302, sendResponse } from './httpResponse';
import { isSkywardPublic } from './skywardPaths';
import { FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH, skywardGradebookPage, skywardShell } from './skywardPages';
import { AERIES_ATTENDANCE_JS, AERIES_DASHBOARD_JS, SKYWARD_GRADEBOOK_JS } from './staticScripts';
import type { Logger } from '../../../logger/dist/index.js';

export async function handleFakePortalRequest(
  req: IncomingMessage,
  res: ServerResponse,
  logger: Logger,
  port: number
): Promise<void> {
  const host = req.headers.host ?? `127.0.0.1:${port}`;
  const fullUrl = new URL(req.url ?? '/', `http://${host}`);
  const pathname = fullUrl.pathname;
  const jar = parseCookieHeader(req.headers.cookie);
  const cspState = buildCspState(fullUrl.search, jar);

  try {
    if (pathname === '/static/aeries-dashboard.js' && req.method === 'GET') {
      sendResponse(res, 200, AERIES_DASHBOARD_JS, 'application/javascript; charset=utf-8', cspState);
      return;
    }
    if (pathname === '/static/aeries-attendance.js' && req.method === 'GET') {
      sendResponse(res, 200, AERIES_ATTENDANCE_JS, 'application/javascript; charset=utf-8', cspState);
      return;
    }
    if (pathname === '/static/skyward-gradebook.js' && req.method === 'GET') {
      sendResponse(res, 200, SKYWARD_GRADEBOOK_JS, 'application/javascript; charset=utf-8', cspState);
      return;
    }

    if (pathname === '/' && req.method === 'GET') {
      const skyNext = FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH;
      sendResponse(
        res,
        200,
        htmlPage(
          '<h1>Fake portals</h1><ul>' +
            '<li><a href="/fake-aeries/student/LoginParent.aspx">Aeries</a></li>' +
            `<li><a href="/skyward/login?next=${encodeURIComponent(skyNext)}">Skyward</a></li>` +
            '</ul>'
        ),
        'text/html; charset=utf-8',
        cspState
      );
      return;
    }

    if (pathname === `${AERIES_ROOT}LoginParent.aspx` && req.method === 'GET') {
      if (isAuthorized(jar)) {
        redirect302(res, `${AERIES_ROOT}Dashboard.aspx`, cspState);
        return;
      }
      sendResponse(
        res,
        200,
        loginForm({
          title: 'Fake Aeries',
          action: `${AERIES_ROOT}LoginParent.aspx`,
          nextUrl: `${AERIES_ROOT}Dashboard.aspx`,
        }),
        'text/html; charset=utf-8',
        cspState
      );
      return;
    }

    if (pathname === `${AERIES_ROOT}LoginParent.aspx` && req.method === 'POST') {
      const body = await readBody(req);
      const form = parseForm(body);
      if (form['username'] !== DEMO_USER || form['password'] !== DEMO_PASS) {
        sendResponse(res, 401, htmlPage('<p>Invalid credentials</p>'), 'text/html; charset=utf-8', cspState);
        return;
      }
      const nextUrl = form['next'] ?? `${AERIES_ROOT}Dashboard.aspx`;
      redirect302(res, nextUrl, cspState, [
        `${COOKIE_AUTH}=1; Path=/; HttpOnly; SameSite=Lax`,
        `${COOKIE_AERIES_STU}=A; Path=/; HttpOnly; SameSite=Lax`,
      ]);
      return;
    }

    if (pathname === '/skyward/login' && req.method === 'GET') {
      const nextDefault = FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH;
      const nu = fullUrl.searchParams.get('next');
      const nextUrl = nu && nu.length > 0 ? nu : nextDefault;
      if (isAuthorized(jar)) {
        redirect302(res, nextUrl, cspState);
        return;
      }
      sendResponse(
        res,
        200,
        loginForm({
          title: 'Fake Skyward',
          action: '/skyward/login',
          nextUrl,
        }),
        'text/html; charset=utf-8',
        cspState
      );
      return;
    }

    if (pathname === '/skyward/login' && req.method === 'POST') {
      const body = await readBody(req);
      const form = parseForm(body);
      if (form['username'] !== DEMO_USER || form['password'] !== DEMO_PASS) {
        sendResponse(res, 401, htmlPage('<p>Invalid credentials</p>'), 'text/html; charset=utf-8', cspState);
        return;
      }
      const nextUrl = form['next'] ?? FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH;
      redirect302(res, nextUrl, cspState, [`${COOKIE_AUTH}=1; Path=/; HttpOnly; SameSite=Lax`]);
      return;
    }

    const needsAuth = !isSkywardPublic(pathname);
    if (needsAuth && !isAuthorized(jar)) {
      sendResponse(res, 401, 'Unauthorized', 'text/plain; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${AERIES_ROOT}ChangeStudent.aspx` && req.method === 'GET') {
      const nextStu = readAeriesStudent(jar) === 'A' ? 'B' : 'A';
      redirect302(res, `${AERIES_ROOT}Dashboard.aspx`, cspState, [
        `${COOKIE_AERIES_STU}=${nextStu}; Path=/; HttpOnly; SameSite=Lax`,
      ]);
      return;
    }

    if (pathname === `${AERIES_ROOT}Dashboard.aspx` && req.method === 'GET') {
      const stu = readAeriesStudent(jar);
      const inner = buildM402AeriesDashboardDeferredShell(stu, {
        scriptSrc: `${SCRIPT_BASE}/aeries-dashboard.js`,
      });
      sendResponse(res, 200, htmlPage(inner), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${AERIES_ROOT}Classes.aspx` && req.method === 'GET') {
      sendResponse(
        res,
        200,
        htmlPage(buildM402AeriesClasses(readAeriesStudent(jar))),
        'text/html; charset=utf-8',
        cspState
      );
      return;
    }

    if (pathname === `${AERIES_ROOT}Widgets/ClassSummary/RedirectToGradebook` && req.method === 'GET') {
      const gn = fullUrl.searchParams.get('GradebookNumber') ?? '';
      sendResponse(res, 200, htmlPage(buildM402AeriesGradebook(gn)), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${AERIES_ROOT}Attendance.aspx` && req.method === 'GET') {
      const inner =
        readAeriesStudent(jar) === 'A'
          ? buildM402AeriesAttendanceDeferredShell({ scriptSrc: `${SCRIPT_BASE}/aeries-attendance.js` })
          : '<table id="tblNewFlex"></table>';
      sendResponse(res, 200, htmlPage(inner), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH && req.method === 'GET') {
      sendResponse(res, 200, htmlPage(skywardGradebookPage('')), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === '/skyward/attendance' && req.method === 'GET') {
      sendResponse(
        res,
        200,
        htmlPage(skywardShell(buildM402SkywardAttendanceBody())),
        'text/html; charset=utf-8',
        cspState
      );
      return;
    }

    if (pathname === '/skyward/schedule' && req.method === 'GET') {
      sendResponse(res, 200, htmlPage(skywardShell(buildM402SkywardScheduleBody())), 'text/html; charset=utf-8', cspState);
      return;
    }

    sendResponse(res, 404, htmlPage('<p>Not Found</p>'), 'text/html; charset=utf-8', cspState);
  } catch (err) {
    logger.error({ err }, 'fake-portal request error');
    sendResponse(res, 500, 'Internal error', 'text/plain; charset=utf-8', buildCspState('', {}));
  }
}
