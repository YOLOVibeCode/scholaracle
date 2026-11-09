import http from 'k6/http';
import { check, sleep } from 'k6';

const API_BASE = __ENV.API_BASE_URL || 'http://127.0.0.1:2801';
const TOKEN = __ENV.K6_PARENT_TOKEN || '';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '30s', target: 60 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:list}': ['p(95)<250'],
    'http_req_duration{endpoint:by_id}': ['p(95)<100'],
    http_req_failed: ['rate<0.01'],
  },
};

function authHeaders() {
  return {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    tags: { auth: 'parent' },
  };
}

export default function () {
  const health = http.get(`${API_BASE}/api/health`, { tags: { endpoint: 'health' } });
  check(health, { 'health ok': (r) => r.status === 200 });

  if (!TOKEN) {
    sleep(1);
    return;
  }

  const listRes = http.get(`${API_BASE}/api/alerts-api`, {
    ...authHeaders(),
    tags: { endpoint: 'list' },
  });
  check(listRes, { 'alerts list 200': (r) => r.status === 200 });

  let alertId = null;
  try {
    const items = listRes.json();
    if (Array.isArray(items) && items.length > 0) {
      alertId = items[0].id;
    }
  } catch {
    alertId = null;
  }

  if (alertId) {
    const byId = http.get(`${API_BASE}/api/alerts-api/${alertId}`, {
      ...authHeaders(),
      tags: { endpoint: 'by_id' },
    });
    check(byId, { 'alert by id 200': (r) => r.status === 200 });
  }

  sleep(1);
}
