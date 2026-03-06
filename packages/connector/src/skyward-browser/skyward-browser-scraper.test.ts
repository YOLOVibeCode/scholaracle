/**
 * SkywardBrowserScraper tests — mock Playwright, assert launch, authenticate, extractGradebook, extractAttendance, extractSchedule, close.
 */

import {
  createMockPage,
  createMockContext,
  createMockBrowser,
  createMockLocator,
} from './__mocks__/playwright-mock';
import { SkywardBrowserScraper } from './skyward-browser-scraper';

const mockLaunch = jest.fn();
jest.mock('playwright', () => ({
  chromium: {
    launch: (...args: unknown[]) => mockLaunch(...args),
  },
}));

describe('SkywardBrowserScraper', () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let mockContext: ReturnType<typeof createMockContext>;
  let mockBrowser: ReturnType<typeof createMockBrowser>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPage = createMockPage({ url: 'https://skyward.example.com' });
    mockContext = createMockContext();
    (mockContext.newPage as jest.Mock).mockResolvedValue(mockPage);
    mockBrowser = createMockBrowser();
    (mockBrowser.newContext as jest.Mock).mockResolvedValue(mockContext);
    mockLaunch.mockResolvedValue(mockBrowser);
  });

  describe('launch', () => {
    it('launches browser with headless option and sets timeout', async () => {
      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true, timeout: 20000 });

      expect(mockLaunch).toHaveBeenCalledWith({ headless: true });
      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(20000);
    });
  });

  describe('authenticate', () => {
    it('navigates, fills credentials, clicks login via password path', async () => {
      const sharedLoc = createMockLocator();
      (sharedLoc.count as jest.Mock).mockResolvedValue(0);
      (mockPage.locator as jest.Mock).mockReturnValue(sharedLoc);
      (mockPage.url as jest.Mock)
        .mockReturnValueOnce('https://skyward.example.com')
        .mockReturnValue('https://skyward.example.com/home');

      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      const result = await scraper.authenticate(
        'https://skyward.example.com',
        'parent@example.com',
        'secret'
      );

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://skyward.example.com',
        expect.objectContaining({ waitUntil: 'networkidle' })
      );
      expect(sharedLoc.fill).toHaveBeenCalledWith('parent@example.com');
      expect(sharedLoc.fill).toHaveBeenCalledWith('secret');
      expect(sharedLoc.click).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('handles popup via context.on("page") and uses popup as main page', async () => {
      const sharedLoc = createMockLocator();
      (sharedLoc.count as jest.Mock).mockResolvedValue(0);
      (mockPage.locator as jest.Mock).mockReturnValue(sharedLoc);

      const popupPage = createMockPage({ url: 'https://skyward.example.com/home' });
      (popupPage.url as jest.Mock).mockReturnValue('https://skyward.example.com/home');
      (mockPage.url as jest.Mock).mockReturnValue('https://skyward.example.com/login');

      let pageHandler: ((p: unknown) => void) | undefined;
      (mockContext.on as jest.Mock).mockImplementation((ev: string, fn: (p: unknown) => void) => {
        if (ev === 'page') pageHandler = fn;
      });
      (mockPage.waitForTimeout as jest.Mock).mockImplementation(async () => {
        if (pageHandler) pageHandler(popupPage);
      });

      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      const result = await scraper.authenticate('https://skyward.example.com', 'user', 'pass');

      expect(mockContext.on).toHaveBeenCalledWith('page', expect.any(Function));
      expect(result.success).toBe(true);
    });

    it('returns auth failure when final URL contains seplog', async () => {
      const sharedLoc = createMockLocator();
      (sharedLoc.count as jest.Mock).mockResolvedValue(0);
      (mockPage.locator as jest.Mock).mockReturnValue(sharedLoc);
      (mockPage.url as jest.Mock).mockReturnValue('https://skyward.example.com/seplog01.w');

      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      const result = await scraper.authenticate('https://skyward.example.com', 'user', 'pass');

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/seplog/);
    });
  });

  describe('extractAll', () => {
    it('returns well-shaped extract from mocked evaluate and content', async () => {
      const loc = createMockLocator();
      (loc.count as jest.Mock).mockResolvedValue(0);
      (loc.first as jest.Mock).mockReturnValue(loc);
      (mockPage.locator as jest.Mock).mockReturnValue(loc);
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce('Student Name')
        .mockResolvedValueOnce('School Name')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (mockPage.content as jest.Mock).mockResolvedValue('<html><body></body></html>');

      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      await scraper.authenticate('https://skyward.example.com', 'u', 'p');

      const result = await scraper.extractAll();

      expect(result).toHaveProperty('student');
      expect(result).toHaveProperty('school');
      expect(result).toHaveProperty('courses');
      expect(result).toHaveProperty('assignments');
      expect(result).toHaveProperty('missingAssignments');
      expect(result).toHaveProperty('attendance');
      expect(result).toHaveProperty('schedule');
      expect(result).toHaveProperty('timestamp');
    });

    it('returns non-empty assignments when gradebook HTML includes assignment detail table', async () => {
      const loc = createMockLocator();
      (loc.count as jest.Mock).mockResolvedValue(0);
      (loc.first as jest.Mock).mockReturnValue(loc);
      (mockPage.locator as jest.Mock).mockReturnValue(loc);
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce('Ava Johnson')
        .mockResolvedValueOnce('Lincoln High School')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const gradebookWithAssignments = [
        'Missing Assignments',
        'Class Grades',
        '<table id="classDesc_1_2_3_4"><tr><td class="bld classDesc"><a href="#">AP Mathematics</a></td></tr>',
        '<label>Period</label> 3',
        'grid_stuGradesGrid',
        '<table id="stuAssignmentSummaryGrid">',
        '<tr><td>Assignment</td><td>Category</td><td>Due Date</td><td>Points Earned</td><td>Points Possible</td><td>Grade</td></tr>',
        '<tr><td>Quiz 1</td><td>Major</td><td>02/10/2026</td><td>95</td><td>100</td><td>95</td></tr>',
        '</table>',
      ].join('\n');
      (mockPage.content as jest.Mock).mockResolvedValue(
        `<html><body>${gradebookWithAssignments}</body></html>`
      );

      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      await scraper.authenticate('https://skyward.example.com', 'u', 'p');

      const result = await scraper.extractAll();

      expect(result.assignments).toBeDefined();
      expect(Array.isArray(result.assignments)).toBe(true);
      expect(result.assignments.length).toBeGreaterThan(0);
      const first = result.assignments[0];
      expect(first).toMatchObject({
        title: 'Quiz 1',
        course: expect.any(String),
        period: expect.any(String),
        category: 'Major',
        dueDate: '02/10/2026',
        pointsEarned: '95',
        pointsPossible: '100',
        grade: '95',
        status: 'graded',
      });
    });

    it('extracts assignments for ALL courses when multiple course links exist', async () => {
      const loc = createMockLocator();
      (loc.count as jest.Mock).mockResolvedValue(1);
      (loc.first as jest.Mock).mockReturnValue(loc);
      (mockPage.locator as jest.Mock).mockReturnValue(loc);
      (mockPage.evaluate as jest.Mock)
        .mockResolvedValueOnce('Ava Johnson')
        .mockResolvedValueOnce('Lincoln High School')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const gradebookHtml = [
        'Missing Assignments',
        'Class Grades',
        '<table id="classDesc_1_2_3_4"><tr><td class="bld classDesc"><a href="#">AP Mathematics</a></td></tr><label>Period</label> 3</table>',
        '<table id="classDesc_5_6_7_8"><tr><td class="bld classDesc"><a href="#">English Literature</a></td></tr><label>Period</label> 4</table>',
        '<table id="classDesc_9_10_11_12"><tr><td class="bld classDesc"><a href="#">World History</a></td></tr><label>Period</label> 5</table>',
        'grid_stuGradesGrid',
      ].join('\n');

      const mathAssignmentsHtml = [
        '<table id="stuAssignmentSummaryGrid">',
        '<tr><td>Assignment</td><td>Category</td><td>Due Date</td><td>Points Earned</td><td>Points Possible</td><td>Grade</td></tr>',
        '<tr><td>Math Quiz 1</td><td>Major</td><td>02/10/2026</td><td>95</td><td>100</td><td>95</td></tr>',
        '<tr><td>Math HW 1</td><td>Daily</td><td>02/12/2026</td><td>10</td><td>10</td><td>100</td></tr>',
        '</table>',
      ].join('\n');

      const englishAssignmentsHtml = [
        '<table id="stuAssignmentSummaryGrid">',
        '<tr><td>Assignment</td><td>Category</td><td>Due Date</td><td>Points Earned</td><td>Points Possible</td><td>Grade</td></tr>',
        '<tr><td>Essay 1</td><td>Major</td><td>02/15/2026</td><td>88</td><td>100</td><td>88</td></tr>',
        '</table>',
      ].join('\n');

      const historyAssignmentsHtml = [
        '<table id="stuAssignmentSummaryGrid">',
        '<tr><td>Assignment</td><td>Category</td><td>Due Date</td><td>Points Earned</td><td>Points Possible</td><td>Grade</td></tr>',
        '<tr><td>Chapter 5 Test</td><td>Test</td><td>02/18/2026</td><td>92</td><td>100</td><td>92</td></tr>',
        '</table>',
      ].join('\n');

      (mockPage.content as jest.Mock)
        .mockResolvedValueOnce(`<html><body>${gradebookHtml}</body></html>`)
        .mockResolvedValueOnce(`<html><body>${gradebookHtml}</body></html>`)
        .mockResolvedValueOnce(`<html><body>${mathAssignmentsHtml}</body></html>`)
        .mockResolvedValueOnce(`<html><body>${englishAssignmentsHtml}</body></html>`)
        .mockResolvedValueOnce(`<html><body>${historyAssignmentsHtml}</body></html>`);

      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      await scraper.authenticate('https://skyward.example.com', 'u', 'p');

      const result = await scraper.extractAll();

      expect(result.assignments).toBeDefined();
      expect(Array.isArray(result.assignments)).toBe(true);
      expect(result.assignments.length).toBe(4);
      expect(
        result.assignments.some((a) => a.title === 'Math Quiz 1' && a.course === 'AP Mathematics')
      ).toBe(true);
      expect(
        result.assignments.some((a) => a.title === 'Math HW 1' && a.course === 'AP Mathematics')
      ).toBe(true);
      expect(
        result.assignments.some((a) => a.title === 'Essay 1' && a.course === 'English Literature')
      ).toBe(true);
      expect(
        result.assignments.some((a) => a.title === 'Chapter 5 Test' && a.course === 'World History')
      ).toBe(true);
    });
  });

  describe('close', () => {
    it('closes the browser', async () => {
      const scraper = new SkywardBrowserScraper();
      await scraper.launch({ headless: true });
      await scraper.close();

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
