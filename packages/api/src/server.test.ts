import request from 'supertest';
import { createApp } from './server';

describe('Server', () => {
  describe('createApp', () => {
    it('should create Express app with health endpoint', async () => {
      // Arrange
      const app = createApp();

      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('does not expose /api/alerts when no database is configured (DEF-003)', async () => {
      // Without a database the alerts route cannot enforce ownership, so it is
      // intentionally not mounted. Previously the route was mounted unconditionally
      // which meant unauthenticated callers could POST notifications against any
      // studentId — see DEFECTS.md DEF-003.
      const app = createApp();

      const response = await request(app).post('/api/alerts').send({
        studentId: 'student-123',
        type: 'missing_assignment',
        severity: 'high',
      });

      expect(response.status).toBe(404);
    });

    it('should handle CORS', async () => {
      // Arrange
      const app = createApp();

      // Act
      const response = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');

      // Assert
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});
