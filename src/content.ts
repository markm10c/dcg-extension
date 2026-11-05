import {
  BRIDGE_PORT,
  EXTENSION_SOURCE,
  ExtensionEvent,
  ext,
  isPageRequest,
} from './shared';

function postToPage(event: ExtensionEvent) {
  window.postMessage(
    { source: EXTENSION_SOURCE, ...event },
    window.location.origin
  );
}

const readyEvent: ExtensionEvent = {
  type: 'ready',
  version: ext.runtime.getManifest().version,
};

let port: chrome.runtime.Port | null = null;

function bridgePort() {
  if (!port) {
    port = ext.runtime.connect({ name: BRIDGE_PORT });
    port.onMessage.addListener((event: ExtensionEvent) => postToPage(event));
    port.onDisconnect.addListener(() => {
      port = null;
    });
  }
  return port;
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }
  if (!isPageRequest(event.data)) return;

  const request = event.data;
  if (request.type === 'ping') {
    postToPage(readyEvent);
    return;
  }

  const { requestId, scannerHost, method, path, sessionId, body } = request;
  bridgePort().postMessage({ requestId, scannerHost, method, path, sessionId, body });
});

postToPage(readyEvent);
