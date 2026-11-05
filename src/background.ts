import {
  BRIDGE_PORT,
  ExtensionEvent,
  ScannerRequest,
  ScannerResponse,
  ext,
  localOrigins,
  missingOrigins,
} from './shared';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const REQUEST_TIMEOUT_MS = 15_000;
const LOCAL_CONTENT_SCRIPT_ID = 'local-development';

type OpenSession = { scannerHost: string; sessionId: string };

async function syncLocalContentScript() {
  const origins = localOrigins();
  const isEnabled = await ext.permissions.contains({ origins });
  const registered = await ext.scripting.getRegisteredContentScripts({
    ids: [LOCAL_CONTENT_SCRIPT_ID],
  });
  if (isEnabled && registered.length === 0) {
    await ext.scripting.registerContentScripts([
      { id: LOCAL_CONTENT_SCRIPT_ID, matches: origins, js: ['content.js'], runAt: 'document_start' },
    ]);
  } else if (!isEnabled && registered.length > 0) {
    await ext.scripting.unregisterContentScripts({ ids: [LOCAL_CONTENT_SCRIPT_ID] });
  }
}

syncLocalContentScript();

// Firefox doesn't grant host permissions on install, so ask straight away
ext.runtime.onInstalled.addListener(async () => {
  if ((await missingOrigins()).length > 0) {
    ext.tabs.create({ url: ext.runtime.getURL('popup.html') });
  }
});
ext.permissions.onAdded.addListener(syncLocalContentScript);
ext.permissions.onRemoved.addListener(syncLocalContentScript);

ext.runtime.onConnect.addListener((port) => {
  if (port.name !== BRIDGE_PORT) return;

  const openSessions: OpenSession[] = [];
  let connected = true;

  // A page closed mid-scan would otherwise leave the scanner held by a session nobody can release
  port.onDisconnect.addListener(() => {
    connected = false;
    for (const { scannerHost, sessionId } of openSessions) {
      forward({ scannerHost, method: 'POST', path: '/api/session/StopScan', sessionId, body: '{}' })
        .then(() => forward({ scannerHost, method: 'DELETE', path: '/api/session', sessionId }))
        .catch(() => undefined);
    }
  });

  port.onMessage.addListener(async (request: ScannerRequest) => {
    const event = await handleRequest(request);
    if (event.type === 'response') trackSession(openSessions, request, event.response);
    if (connected) port.postMessage(event);
  });
});

async function handleRequest(request: ScannerRequest): Promise<ExtensionEvent> {
  const { requestId } = request;
  const invalidMessage = validate(request);
  if (invalidMessage) {
    return { type: 'error', requestId, reason: 'invalid_request', message: invalidMessage };
  }
  if ((await missingOrigins()).length > 0) {
    return {
      type: 'error',
      requestId,
      reason: 'no_permission',
      message: 'Click the DCG Scanner Bridge icon in your browser toolbar and choose Allow.',
    };
  }
  try {
    return { type: 'response', requestId, response: await forward(request) };
  } catch (error) {
    return {
      type: 'error',
      requestId,
      reason: 'unreachable',
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

function validate({ scannerHost, method, path, sessionId, body }: ScannerRequest): string | null {
  if (typeof scannerHost !== 'string' || !/^[a-z0-9-]+\.local$/i.test(scannerHost)) {
    return `"${scannerHost}" isn't a scanner name. Use the name ending in .local.`;
  }
  if (!METHODS.includes(method)) return `Unsupported method "${method}".`;
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    return `Only /api/ paths can be requested, not "${path}".`;
  }
  if (!isOptionalString(sessionId) || !isOptionalString(body)) {
    return 'sessionId and body must be strings.';
  }
  return null;
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string';
}

async function forward({
  scannerHost,
  method,
  path,
  sessionId,
  body,
}: Omit<ScannerRequest, 'requestId'>): Promise<ScannerResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) headers.SessionId = sessionId;
  const response = await fetch(`http://${scannerHost}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const contentType = responseHeaders['content-type'] ?? '';
  return {
    status: response.status,
    headers: responseHeaders,
    body: contentType.startsWith('image/')
      ? `data:${contentType};base64,${toBase64(await response.arrayBuffer())}`
      : await response.text(),
  };
}

function trackSession(
  openSessions: OpenSession[],
  { scannerHost, method, path, sessionId }: ScannerRequest,
  response: ScannerResponse
) {
  if (path !== '/api/session' || response.status !== 200) return;
  if (method === 'POST') {
    const body: { SessionId?: string } = JSON.parse(response.body);
    if (body.SessionId) openSessions.push({ scannerHost, sessionId: body.SessionId });
  } else if (method === 'DELETE') {
    const index = openSessions.findIndex((session) => session.sessionId === sessionId);
    if (index !== -1) openSessions.splice(index, 1);
  }
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
