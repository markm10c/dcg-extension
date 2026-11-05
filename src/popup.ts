import { ext, localOrigins, missingOrigins, requiredOrigins } from './shared';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing popup element #${id}`);
  return found as T;
}

const readySection = element<HTMLElement>('ready');
const setupSection = element<HTMLElement>('setup');
const setupText = element<HTMLParagraphElement>('setup-text');
const allowButton = element<HTMLButtonElement>('allow');
const versionText = element<HTMLSpanElement>('version');
const localButton = element<HTMLButtonElement>('local');

let isLocalEnabled = false;

async function refresh() {
  const isReady = (await missingOrigins()).length === 0;
  readySection.hidden = !isReady;
  setupSection.hidden = isReady;

  isLocalEnabled = await ext.permissions.contains({ origins: localOrigins() });
  localButton.textContent = isLocalEnabled
    ? 'Turn off on this site'
    : 'Use on this site';
}

async function showLocalToggle() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  const tabHost = new URL(tab.url).hostname;
  localButton.hidden = !localOrigins().some(
    (origin) => new URL(origin.replace('*', '')).hostname === tabHost
  );
}

allowButton.addEventListener('click', () => {
  ext.permissions
    .request({ origins: requiredOrigins() })
    .then((granted) => {
      if (!granted) {
        setupText.textContent =
          "Access wasn't allowed. Click Allow and choose Allow in the box that appears.";
      }
      refresh();
    })
    .catch(() => {
      setupText.textContent =
        'Something went wrong. Close this and click the DCG Scanner Bridge icon again.';
    });
});

// Firefox only shows the permission prompt if request() runs synchronously in the click handler
localButton.addEventListener('click', () => {
  const origins = localOrigins();
  (isLocalEnabled
    ? ext.permissions.remove({ origins })
    : ext.permissions.request({ origins })
  ).then(refresh);
});

versionText.textContent = `Version ${ext.runtime.getManifest().version}`;
refresh();
showLocalToggle();
