import { SkywardClient, type ISkywardScraper } from './skyward-client';

function createMockScraper(): ISkywardScraper {
  return {
    scrapeReport: jest.fn().mockResolvedValue({ data: [] }),
    scrapeGradebook: jest.fn().mockResolvedValue({
      data: {
        course: 'MATH',
        instructor: 'Mr. A',
        period: 1,
        score: 90,
        grade: 90,
        gradebook: [],
      },
    }),
    scrapeHistory: jest.fn().mockResolvedValue({ data: [] }),
  };
}

describe('SkywardClient', () => {
  let client: SkywardClient;
  let scraper: ISkywardScraper;

  beforeEach(() => {
    scraper = createMockScraper();
    client = new SkywardClient(
      {
        loginUrl: 'https://skyward.district.net/login',
        username: 'student1',
        password: 'pass123',
      },
      scraper
    );
  });

  describe('getReport', () => {
    it('should call scrapeReport with credentials', async () => {
      const reports = [
        { course: 97776, scores: [{ bucket: 'TERM 1', score: 95 }] },
      ];
      (scraper.scrapeReport as jest.Mock).mockResolvedValue({ data: reports });

      const result = await client.getReport();

      expect(scraper.scrapeReport).toHaveBeenCalledWith('student1', 'pass123');
      expect(result).toEqual(reports);
    });
  });

  describe('getGradebook', () => {
    it('should call scrapeGradebook with credentials and options', async () => {
      const gradebook = {
        course: 'PHYSICS',
        instructor: 'Dr. B',
        period: 2,
        score: 88,
        grade: 88,
        gradebook: [],
      };
      (scraper.scrapeGradebook as jest.Mock).mockResolvedValue({ data: gradebook });

      const result = await client.getGradebook(97776, 'TERM 1');

      expect(scraper.scrapeGradebook).toHaveBeenCalledWith('student1', 'pass123', {
        course: 97776,
        bucket: 'TERM 1',
      });
      expect(result).toEqual(gradebook);
    });
  });

  describe('getHistory', () => {
    it('should call scrapeHistory with credentials', async () => {
      const history = [
        {
          dates: { begin: '2024', end: '2025' },
          grade: 11,
          courses: [{ course: 'ENGLISH', scores: [{ grade: 92, lit: 'S1' }] }],
        },
      ];
      (scraper.scrapeHistory as jest.Mock).mockResolvedValue({ data: history });

      const result = await client.getHistory();

      expect(scraper.scrapeHistory).toHaveBeenCalledWith('student1', 'pass123');
      expect(result).toEqual(history);
    });
  });
});
