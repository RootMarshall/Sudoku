const https = require('https');
const config = require('./config');
const auth = require('./auth');

function getBaseUrl() {
  const url = config.api.baseUrl;
  if (!url || url === 'YOUR_API_GATEWAY_BASE_URL') {
    return null;
  }
  return url.replace(/\/$/, '');
}

function apiRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      reject(new Error('API not configured. Update electron/config.js with your API Gateway base URL.'));
      return;
    }

    const url = path.startsWith('http') ? path : path.startsWith('?') ? baseUrl + path : baseUrl + (path.startsWith('/') ? path : path ? '/' + path : '');
    const u = new URL(url);

    const headers = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${String(accessToken).trim()}`;
    }

    const reqBody = body ? JSON.stringify(body) : undefined;
    if (reqBody) {
      headers['Content-Length'] = Buffer.byteLength(reqBody);
    }

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => { buf += chunk; });
        res.on('end', () => {
          if (res.statusCode === 401) reject(new Error('Unauthorized'));
          else if (res.statusCode >= 400) reject(new Error(buf || `Request failed: ${res.statusCode}`));
          else resolve(buf ? JSON.parse(buf) : null);
        });
      }
    );
    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

async function saveDailyCompletion(data) {
  const token = auth.getIdToken() || auth.getAccessToken();
  if (!token) {
    throw new Error('Not logged in');
  }
  return apiRequest('PUT', '', data, token);
}

async function getDailyCompletion(date) {
  const token = auth.getIdToken() || auth.getAccessToken();
  if (!token) {
    throw new Error('Not logged in');
  }
  return apiRequest('GET', `?date=${encodeURIComponent(date)}`, null, token);
}

async function getLeaderboard(date) {
  const token = auth.getIdToken() || auth.getAccessToken();
  if (!token) {
    throw new Error('Not logged in');
  }
  return apiRequest('GET', `?date=${encodeURIComponent(date)}&leaderboard=true`, null, token);
}

module.exports = {
  saveDailyCompletion,
  getDailyCompletion,
  getLeaderboard,
};
