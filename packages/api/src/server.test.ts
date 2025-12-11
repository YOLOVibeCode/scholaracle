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

    it('should create Express app with alerts endpoint', async () => {
      // Arrange
      const app = createApp();

      // Act
      const response = await request(app).post('/api/alerts').send({
        studentId: 'student-123',
        type: 'missing_assignment',
        severity: 'high',
      });

      // Assert
      // Should return 400 or 500 (depending on whether services are configured)
      // But should not return 404
      expect(response.status).not.toBe(404);
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
