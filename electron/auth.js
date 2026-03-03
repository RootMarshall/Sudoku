const { app, BrowserWindow, safeStorage, session } = require('electron');
const crypto = require('crypto');
const https = require('https');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const REDIRECT_URI = 'http://localhost/callback';
const TOKEN_FILE = 'cognito-tokens.json';

function getTokenPath() {
  return path.join(app.getPath('userData'), TOKEN_FILE);
}

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(decoded);
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(body).toString();
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => { buf += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(buf);
            if (res.statusCode >= 400) {
              reject(new Error(json.error_description || json.error || buf));
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error(buf || 'Token exchange failed'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getTokenUrl() {
  const { region, domain } = config.cognito;
  return `https://${domain}.auth.${region}.amazoncognito.com/oauth2/token`;
}

function getAuthorizeUrl(codeChallenge) {
  const { region, domain, clientId } = config.cognito;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: REDIRECT_URI,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://${domain}.auth.${region}.amazoncognito.com/oauth2/authorize?${params}`;
}

function canUseEncryption() {
  return safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
}

function loadStoredTokens() {
  try {
    const p = getTokenPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.plain) {
      return parsed.tokens;
    }
    if (canUseEncryption() && parsed.data) {
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.data, 'base64'));
      return JSON.parse(decrypted);
    }
    return null;
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  const p = getTokenPath();
  const json = JSON.stringify(tokens);
  if (canUseEncryption()) {
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(p, JSON.stringify({ data: encrypted.toString('base64') }), 'utf8');
  } else {
    fs.writeFileSync(p, JSON.stringify({ plain: true, tokens }), 'utf8');
  }
}

function clearTokens() {
  try {
    const p = getTokenPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

function isTokenExpired(payload, leewaySeconds = 60) {
  if (!payload || !payload.exp) return true;
  return Date.now() / 1000 >= payload.exp - leewaySeconds;
}

async function refreshTokens(refreshToken) {
  const { clientId } = config.cognito;
  const body = {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  };
  const res = await httpsPost(getTokenUrl(), body);
  const idPayload = decodeJwtPayload(res.id_token);
  const user = idPayload ? {
    sub: idPayload.sub,
    name: idPayload.name || idPayload['cognito:username'] || '',
    nickname: idPayload.nickname || idPayload['cognito:username'] || '',
    email: idPayload.email || '',
  } : null;
  const tokens = {
    id_token: res.id_token,
    access_token: res.access_token,
    refresh_token: refreshToken,
    expires_at: idPayload && idPayload.exp ? idPayload.exp * 1000 : Date.now() + 3600000,
    user,
  };
  saveTokens(tokens);
  return tokens;
}

async function login() {
  const { clientId, domain } = config.cognito;
  if (!clientId || clientId === 'YOUR_PUBLIC_CLIENT_ID' || !domain || domain === 'YOUR_COGNITO_DOMAIN_PREFIX') {
    throw new Error('Cognito not configured. Update electron/config.js with your client ID and domain.');
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const authUrl = getAuthorizeUrl(codeChallenge);

  const authCode = await new Promise((resolve, reject) => {
    const authPartition = 'auth-' + Date.now();
    const authSession = session.fromPartition(authPartition);
    const authWin = new BrowserWindow({
      width: 480,
      height: 640,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: authPartition,
      },
    });

    authWin.once('ready-to-show', () => authWin.show());

    let handled = false;
    function handleCallbackUrl(url) {
      if (!url.startsWith(REDIRECT_URI)) return false;
      if (handled) return true;
      handled = true;
      try {
        const u = new URL(url);
        const code = u.searchParams.get('code');
        const error = u.searchParams.get('error');
        authWin.destroy();
        if (error) {
          reject(new Error(u.searchParams.get('error_description') || error));
        } else if (code) {
          resolve(code);
        } else {
          reject(new Error('No authorization code received'));
        }
        return true;
      } catch (e) {
        authWin.destroy();
        reject(e);
        return true;
      }
    }

    // Intercept callback URL before it loads - prevents blank white screen when
    // Cognito redirects (e.g. after email verification). HTTP redirects trigger
    // will-redirect, but JS redirects may only trigger did-navigate after the
    // page has already navigated to localhost/callback (no server = blank page).
    const callbackFilter = { urls: ['http://localhost/callback*'] };
    const callbackListener = (details, callback) => {
      if (details.url.startsWith(REDIRECT_URI)) {
        callback({ cancel: true });
        handleCallbackUrl(details.url);
      } else {
        callback({});
      }
    };
    authSession.webRequest.onBeforeRequest(callbackFilter, callbackListener);

    authWin.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(REDIRECT_URI)) {
        event.preventDefault();
        handleCallbackUrl(url);
      }
    });

    authWin.webContents.on('did-navigate', (event, url) => {
      handleCallbackUrl(url);
    });

    authWin.on('closed', () => {
      authSession.webRequest.onBeforeRequest(callbackFilter, null);
      if (!handled) reject(new Error('Login window closed'));
    });

    authWin.loadURL(authUrl);
  });

  const body = {
    grant_type: 'authorization_code',
    client_id: clientId,
    code: authCode,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  };

  const res = await httpsPost(getTokenUrl(), body);
  const idPayload = decodeJwtPayload(res.id_token);
  const user = idPayload ? {
    sub: idPayload.sub,
    name: idPayload.name || idPayload['cognito:username'] || '',
    nickname: idPayload.nickname || idPayload['cognito:username'] || '',
    email: idPayload.email || '',
  } : null;

  const tokens = {
    id_token: res.id_token,
    access_token: res.access_token,
    refresh_token: res.refresh_token,
    expires_at: idPayload && idPayload.exp ? idPayload.exp * 1000 : Date.now() + 3600000,
    user,
  };
  saveTokens(tokens);
  return user;
}

function logout() {
  clearTokens();
}

async function getUser() {
  let tokens = loadStoredTokens();
  if (!tokens || !tokens.user) return null;

  const idPayload = decodeJwtPayload(tokens.id_token);
  if (isTokenExpired(idPayload) && tokens.refresh_token) {
    try {
      tokens = await refreshTokens(tokens.refresh_token);
    } catch {
      clearTokens();
      return null;
    }
  } else if (isTokenExpired(idPayload)) {
    clearTokens();
    return null;
  }

  return tokens.user;
}

function getAccessToken() {
  const tokens = loadStoredTokens();
  if (!tokens || !tokens.access_token) return null;
  return tokens.access_token;
}

function getIdToken() {
  const tokens = loadStoredTokens();
  if (!tokens || !tokens.id_token) return null;
  return tokens.id_token;
}

module.exports = {
  login,
  logout,
  getUser,
  getAccessToken,
  getIdToken,
  refreshTokens,
  loadStoredTokens,
};
