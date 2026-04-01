import { SkywardClient } from './skyward-client';

jest.mock('../http', () => ({
  getJson: jest.fn(),
  buildUrl: jest.requireActual('../http').buildUrl,
}));

import { getJson } from '../http';

const mockGetJson = getJson as jest.MockedFunction<typeof getJson>;

describe('SkywardClient', () => {
  let client: SkywardClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new SkywardClient({
      baseUrl: 'https://district.skyward.com',
      accessToken: 'skyward-token',
    });
  });

  describe('ping', () => {
    it('should call classes endpoint with limit=1', async () => {
      mockGetJson.mockResolvedValue({
        data: {
          classes: [
            { sourcedId: 'c1', title: 'Math', course: { sourcedId: 'co1' }, status: 'active' },
          ],
        },
        headers: new Headers(),
      });

      const result = await client.ping();
      expect(result.classCount).toBe(1);
      expect(mockGetJson).toHaveBeenCalledWith(
        expect.stringContaining('/ims/oneroster/v1p2/classes'),
        'skyward-token'
      );
    });

    it('should return 0 for empty classes', async () => {
      mockGetJson.mockResolvedValue({ data: { classes: [] }, headers: new Headers() });

      const result = await client.ping();
      expect(result.classCount).toBe(0);
    });
  });

  describe('getClasses', () => {
    it('should return classes', async () => {
      const classes = [
        { sourcedId: 'c1', title: 'Math', course: { sourcedId: 'co1' }, status: 'active' },
        { sourcedId: 'c2', title: 'English', course: { sourcedId: 'co2' }, status: 'active' },
      ];
      mockGetJson.mockResolvedValue({ data: { classes }, headers: new Headers() });

      const result = await client.getClasses();
      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe('Math');
    });

    it('should handle pagination via offset/limit', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        sourcedId: `c${i}`,
        title: `Class ${i}`,
        course: { sourcedId: `co${i}` },
        status: 'active',
      }));

      mockGetJson
        .mockResolvedValueOnce({ data: { classes: page1 }, headers: new Headers() })
        .mockResolvedValueOnce({ data: { classes: [] }, headers: new Headers() });

      const result = await client.getClasses();
      expect(result).toHaveLength(100);
      expect(mockGetJson).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLineItems', () => {
    it('should fetch line items for a class', async () => {
      const lineItems = [
        {
          sourcedId: 'li1',
          title: 'Homework 1',
          class: { sourcedId: 'c1' },
          resultValueMax: 100,
          status: 'active',
        },
      ];
      mockGetJson.mockResolvedValue({ data: { lineItems }, headers: new Headers() });

      const result = await client.getLineItems('c1');
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('Homework 1');
    });
  });

  describe('getResults', () => {
    it('should fetch results for a class', async () => {
      const results = [
        {
          sourcedId: 'r1',
          lineItem: { sourcedId: 'li1' },
          student: { sourcedId: 's1' },
          score: 85,
          scoreStatus: 'fully graded',
          status: 'active',
        },
      ];
      mockGetJson.mockResolvedValue({ data: { results }, headers: new Headers() });

      const result = await client.getResults('c1');
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(85);
    });
  });

  describe('getEnrollments', () => {
    it('should fetch student enrollments for a class', async () => {
      const enrollments = [
        {
          sourcedId: 'e1',
          user: { sourcedId: 'u1' },
          class: { sourcedId: 'c1' },
          role: 'student',
          status: 'active',
        },
      ];
      mockGetJson.mockResolvedValue({ data: { enrollments }, headers: new Headers() });

      const result = await client.getEnrollments('c1');
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe('student');
    });
  });
});
