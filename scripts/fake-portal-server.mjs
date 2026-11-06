/**
 * Fake Aeries + Skyward portal for Playwright recipe replay (strict CSP, demo/demo).
 * Depends on built CJS outputs: pnpm --filter @scholaracle/contracts build &&
 * pnpm --filter @scholaracle/logger build && pnpm --filter @scholaracle/scraper-core build
 * Run: node scripts/fake-portal-server.mjs
 */
import * as http from 'http';
import { URL } from 'url';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createLogger } = require(join(root, 'packages/logger/dist/index.js'));
const {
  FAKE_PORTAL_SKYWARD_ASSIGNMENTS,
  FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH,
  buildM402AeriesAttendanceDeferredShell,
  buildM402AeriesClasses,
  buildM402AeriesDashboardDeferredShell,
  buildM402AeriesGradebook,
  buildM402SkywardAttendanceBody,
  buildM402SkywardGradebookBody,
  buildM402SkywardScheduleBody,
} = require(join(root, 'packages/scraper-core/dist/index.js'));

const logger = createLogger('fake-portal');
const DEMO_USER = 'demo';
const DEMO_PASS = 'demo';
const COOKIE_AUTH = 'slc_fp_auth';
const COOKIE_AERIES_STU = 'slc_fp_aeries_stu';
const COOKIE_STRICT = 'slc_fp_strict';
const DEFAULT_PORT = 2855;

const aeriesRoot = '/fake-aeries/student/';
const scriptBase = '/static';

const AERIES_DASHBOARD_JS = `(function(){var el=document.getElementById("slc-aeries-dashboard");if(!el||!el.textContent)return;var cfg=JSON.parse(el.textContent);var inner=cfg.studentKey==="B"?"<div class=\\"Card\\"><div class=\\"RightSide ac\\"><span class=\\"TextSubHeading\\">Grade</span><div class=\\"Grade GradeA\\">100<span>(100.0%)</span></div></div><a class=\\"TextHeading\\" title=\\"Go to Gradebook\\" href=\\"Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=333&Term=FQT2&CDS=1&SC=5\\">Math 8 - Quarter 2</a>\\nLindqvist, R\\n<span class=\\"TextSubSection\\">B12</span><div class=\\"footer TextSubSection\\"><div class=\\"RightSide\\"><table class=\\"ac\\"><tbody class=\\"attendance-container\\"><tr><td class=\\"ac\\" title=\\"Monday - 11/02/2026\\">-</td></tr></tbody></table></div>Missing Assignments <span class=\\"NonMissingAssignment\\">0</span></div><div class=\\"ClassLastUpdated\\" title=\\"Last Updated\\"><i class=\\"fa fa-clock-o\\"></i>Nov 04</div></div>":"<div class=\\"Card\\"><div class=\\"RightSide ac\\"><span class=\\"TextSubHeading\\">Grade</span><div class=\\"Grade GradeA\\">92<span>(92.1%)</span></div></div><a class=\\"TextHeading\\" title=\\"Go to Gradebook\\" href=\\"Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=111&Term=FQT2&CDS=1&SC=5\\">Spanish 2 a - Quarter 2</a>\\nRivera, M\\n<span class=\\"TextSubSection\\">S108</span><div class=\\"footer TextSubSection\\"><div class=\\"RightSide\\"><table class=\\"ac\\"><tbody class=\\"attendance-container\\"><tr><td class=\\"ac\\" title=\\"Monday - 11/02/2026\\">-</td></tr></tbody></table></div>Missing Assignments <span class=\\"NonMissingAssignment\\">0</span></div><div class=\\"ClassLastUpdated\\" title=\\"Last Updated\\"><i class=\\"fa fa-clock-o\\"></i>Nov 04</div></div><div class=\\"Card\\"><div class=\\"RightSide ac\\"><span class=\\"TextSubHeading\\">Grade</span><div class=\\"Grade GradeA\\">78<span>(78.4%)</span></div></div><a class=\\"TextHeading\\" title=\\"Go to Gradebook\\" href=\\"Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=222&Term=FQT2&CDS=1&SC=5\\">Geometry Honors a - Quarter 2</a>\\nOkafor, J\\n<span class=\\"TextSubSection\\">M110</span><div class=\\"footer TextSubSection\\"><div class=\\"RightSide\\"><table class=\\"ac\\"><tbody class=\\"attendance-container\\"><tr><td class=\\"ac\\" title=\\"Monday - 11/02/2026\\">-</td></tr></tbody></table></div>Missing Assignments <span class=\\"MissingAssignment\\">2</span></div><div class=\\"ClassLastUpdated\\" title=\\"Last Updated\\"><i class=\\"fa fa-clock-o\\"></i>Nov 04</div></div>";var shell=document.querySelector("#divClass .classesSection");if(shell)shell.innerHTML=inner;})();`;

const AERIES_ATTENDANCE_JS = `(function(){var tbody=document.querySelector("#tblNewFlex tbody");if(!tbody)return;tbody.innerHTML='<tr class=\\"InlineHeaderTR\\"><td class=\\"k-header\\">Date</td><td class=\\"k-header\\">All Day code</td><td class=\\"k-header\\"><div class=\\"HeaderPD\\">1</div><div class=\\"HeaderTime\\">8:30 AM</div><div class=\\"HeaderClass\\">(1803) Spanish 2 a</div><div class=\\"HeaderTeacher\\">Rivera, M</div></td><td class=\\"k-header\\"><div class=\\"HeaderPD\\">4</div><div class=\\"HeaderTime\\">8:30 AM</div><div class=\\"HeaderClass\\">(1803) Geometry Honors a</div><div class=\\"HeaderTeacher\\">Okafor, J</div></td></tr><tr><td><span class=\\"gridDay\\">Mon</span> <span class=\\"gridDate\\">09/07/2026</span></td><td><span class=\\"AllDayCodeReadOnly defaultpadding\\">HOLIDAY</span></td><td><div class=\\"NoClass\\">-</div></td><td><div class=\\"NoClass\\">-</div></td></tr><tr><td><span class=\\"gridDay\\">Fri</span> <span class=\\"gridDate\\">10/02/2026</span></td><td><span class=\\"AllDayCodeReadOnly defaultpadding\\"></span></td><td><span class=\\"defaultpadding\\"></span></td><td><span class=\\"defaultpadding\\">T</span></td></tr><tr><td><span class=\\"gridDay\\">Tue</span> <span class=\\"gridDate\\">10/06/2026</span></td><td><span class=\\"AllDayCodeReadOnly defaultpadding\\">Testing</span></td><td><span class=\\"defaultpadding\\">C</span></td><td><span class=\\"defaultpadding\\">C</span></td></tr><tr><td><span class=\\"gridDay\\">Wed</span> <span class=\\"gridDate\\">10/07/2026</span></td><td><span class=\\"AllDayCodeReadOnly defaultpadding\\"></span></td><td><span class=\\"defaultpadding\\"></span></td><td><span class=\\"defaultpadding\\"></span></td></tr>';})();`;

const SKYWARD_GRADEBOOK_JS = `(function(){var silentCni="";var scripts=document.getElementsByTagName("script");for(var i=0;i<scripts.length;i++){var s=scripts[i];if(s.src&&s.src.indexOf("skyward-gradebook.js")!==-1){silentCni=s.getAttribute("data-silent")||"";break;}}var assignEl=document.getElementById("slc-skyward-assignments");var ASSIGNMENTS=assignEl&&assignEl.textContent?JSON.parse(assignEl.textContent):{};var wrap=document.querySelector(".sf_DialogWrap");if(!wrap)return;var closeBtn=wrap.querySelector(".sf_DialogClose");if(closeBtn){closeBtn.addEventListener("click",function(){wrap.style.display="none";});}var cells=document.querySelectorAll("a#showGradeInfo");for(var j=0;j<cells.length;j++){cells[j].addEventListener("click",function(ev){var cell=ev.currentTarget;var cni=cell.getAttribute("data-cni");if(cni===silentCni)return;var html=ASSIGNMENTS[cni]||"";setTimeout(function(){var dialog=document.querySelector("#gradeInfoDialog");if(dialog){dialog.innerHTML="<table><tr><th>Due</th><th>Assignment</th><th>Grade</th><th>Score(%)</th><th>Points Score</th><th>Missing</th></tr>"+html+"</table>";}wrap.style.display="block";},0);});}})();`;

const SKYWARD_NAV =
  `<nav>` +
  `<a href="${FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH}">Gradebook</a>` +
  `<a href="/skyward/attendance">Attendance</a>` +
  `<a href="/skyward/schedule">Schedule</a>` +
  `</nav>`;

function skywardShell(inner) {
  return (
    `<div id="schoolName">Sample District</div>` +
    `<div class="sf_headerName">Jamie Student</div>` +
    `<div id="skyward-root">${SKYWARD_NAV}<div id="skyward-section">${inner}</div></div>`
  );
}

function skywardGradebookPage(silentCni) {
  const json = JSON.stringify(FAKE_PORTAL_SKYWARD_ASSIGNMENTS);
  return (
    `<script type="application/json" id="slc-skyward-assignments">${json}</script>` +
    skywardShell(buildM402SkywardGradebookBody()) +
    `<script src="${scriptBase}/skyward-gradebook.js" data-silent="${silentCni}" defer></script>`
  );
}

function getPort() {
  const raw = process.env.FAKE_PORTAL_PORT ?? process.env.PORT;
  if (!raw) return DEFAULT_PORT;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

function parseCookies(header) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function htmlPage(body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Fake portal</title></head><body>${body}</body></html>`;
}

function loginForm(opts) {
  return htmlPage(
    `<h1>${opts.title}</h1><form method="post" action="${opts.action}" data-testid="form-fake-login">` +
      `<input type="hidden" name="next" value="${opts.nextUrl}"/>` +
      `<label>Username <input name="username" type="text" data-testid="input-username"/></label><br/>` +
      `<label>Password <input name="password" type="password" data-testid="input-password"/></label><br/>` +
      `<button type="submit" data-testid="btn-submit">Sign in</button></form>`
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseForm(body) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  return out;
}

function buildCspState(search, jar) {
  const setCookies = [];
  const qs = new URLSearchParams(search);
  if (qs.get('csp') === 'strict') {
    setCookies.push(`${COOKIE_STRICT}=1; Path=/; HttpOnly; SameSite=Lax`);
  }
  const sendCspHeader =
    process.env.FAKE_PORTAL_STRICT_CSP === '1' || qs.get('csp') === 'strict' || jar[COOKIE_STRICT] === '1';
  return { setCookies, sendCspHeader };
}

function mergeCookies(a, b) {
  return [...a, ...b];
}

function sendResponse(res, status, body, contentType, cspState, moreCookies = []) {
  /** @type {import('http').OutgoingHttpHeaders} */
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  };
  if (cspState.sendCspHeader) {
    headers['Content-Security-Policy'] = "default-src 'self'";
  }
  const all = mergeCookies(cspState.setCookies, moreCookies);
  if (all.length > 0) headers['Set-Cookie'] = all;
  res.writeHead(status, headers);
  res.end(body);
}

function redirect302(res, location, cspState, cookies = []) {
  /** @type {import('http').OutgoingHttpHeaders} */
  const headers = { Location: location };
  if (cspState.sendCspHeader) {
    headers['Content-Security-Policy'] = "default-src 'self'";
  }
  const all = mergeCookies(cspState.setCookies, cookies);
  if (all.length > 0) headers['Set-Cookie'] = all;
  res.writeHead(302, headers);
  res.end();
}

function isAuthorized(jar) {
  return jar[COOKIE_AUTH] === '1';
}

function readAeriesStudent(jar) {
  return jar[COOKIE_AERIES_STU] === 'B' ? 'B' : 'A';
}

function isSkywardPublic(pathname) {
  return (
    pathname === FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH ||
    pathname === '/skyward/attendance' ||
    pathname === '/skyward/schedule'
  );
}

async function handleRequest(req, res) {
  const host = req.headers.host ?? `127.0.0.1:${getPort()}`;
  const fullUrl = new URL(req.url ?? '/', `http://${host}`);
  const pathname = fullUrl.pathname;
  const jar = parseCookies(req.headers.cookie);
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
      const page = htmlPage(
        '<h1>Fake portals</h1><ul>' +
          '<li><a href="/fake-aeries/student/LoginParent.aspx">Aeries</a></li>' +
          `<li><a href="/skyward/login?next=${encodeURIComponent(skyNext)}">Skyward</a></li>` +
          '</ul>'
      );
      sendResponse(res, 200, page, 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${aeriesRoot}LoginParent.aspx` && req.method === 'GET') {
      if (isAuthorized(jar)) {
        redirect302(res, `${aeriesRoot}Dashboard.aspx`, cspState);
        return;
      }
      sendResponse(
        res,
        200,
        loginForm({
          title: 'Fake Aeries',
          action: `${aeriesRoot}LoginParent.aspx`,
          nextUrl: `${aeriesRoot}Dashboard.aspx`,
        }),
        'text/html; charset=utf-8',
        cspState
      );
      return;
    }

    if (pathname === `${aeriesRoot}LoginParent.aspx` && req.method === 'POST') {
      const body = await readBody(req);
      const form = parseForm(body);
      if (form.username !== DEMO_USER || form.password !== DEMO_PASS) {
        sendResponse(res, 401, htmlPage('<p>Invalid credentials</p>'), 'text/html; charset=utf-8', cspState);
        return;
      }
      const nextUrl = form.next ?? `${aeriesRoot}Dashboard.aspx`;
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
      if (form.username !== DEMO_USER || form.password !== DEMO_PASS) {
        sendResponse(res, 401, htmlPage('<p>Invalid credentials</p>'), 'text/html; charset=utf-8', cspState);
        return;
      }
      const nextUrl = form.next ?? FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH;
      redirect302(res, nextUrl, cspState, [`${COOKIE_AUTH}=1; Path=/; HttpOnly; SameSite=Lax`]);
      return;
    }

    const needsAuth = !isSkywardPublic(pathname);
    if (needsAuth && !isAuthorized(jar)) {
      sendResponse(res, 401, 'Unauthorized', 'text/plain; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${aeriesRoot}ChangeStudent.aspx` && req.method === 'GET') {
      const nextStu = readAeriesStudent(jar) === 'A' ? 'B' : 'A';
      redirect302(res, `${aeriesRoot}Dashboard.aspx`, cspState, [
        `${COOKIE_AERIES_STU}=${nextStu}; Path=/; HttpOnly; SameSite=Lax`,
      ]);
      return;
    }

    if (pathname === `${aeriesRoot}Dashboard.aspx` && req.method === 'GET') {
      const stu = readAeriesStudent(jar);
      const inner = buildM402AeriesDashboardDeferredShell(stu, {
        scriptSrc: `${scriptBase}/aeries-dashboard.js`,
      });
      sendResponse(res, 200, htmlPage(inner), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${aeriesRoot}Classes.aspx` && req.method === 'GET') {
      const inner = buildM402AeriesClasses(readAeriesStudent(jar));
      sendResponse(res, 200, htmlPage(inner), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${aeriesRoot}Widgets/ClassSummary/RedirectToGradebook` && req.method === 'GET') {
      const gn = fullUrl.searchParams.get('GradebookNumber') ?? '';
      sendResponse(res, 200, htmlPage(buildM402AeriesGradebook(gn)), 'text/html; charset=utf-8', cspState);
      return;
    }

    if (pathname === `${aeriesRoot}Attendance.aspx` && req.method === 'GET') {
      const inner =
        readAeriesStudent(jar) === 'A'
          ? buildM402AeriesAttendanceDeferredShell({ scriptSrc: `${scriptBase}/aeries-attendance.js` })
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

const port = getPort();
const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});
server.listen(port, '127.0.0.1', () => {
  logger.info({ port }, 'fake portal listening');
});
