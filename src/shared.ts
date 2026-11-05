declare const browser: typeof chrome | undefined;

export const ext: typeof chrome =
  typeof browser !== 'undefined' ? browser : chrome;

export const PAGE_SOURCE = 'dcg-scanner-page';
export const EXTENSION_SOURCE = 'dcg-scanner-extension';
export const BRIDGE_PORT = 'dcg-scanner';

export type ScannerRequest = {
  requestId: string;
  scannerHost: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  sessionId?: string;
  body?: string;
};

export type ScannerResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type PageRequest =
  | (ScannerRequest & { source: typeof PAGE_SOURCE; type: 'request' })
  | { source: typeof PAGE_SOURCE; type: 'ping' };

export type ExtensionEvent =
  | { type: 'ready'; version: string }
  | { type: 'response'; requestId: string; response: ScannerResponse }
  | {
      type: 'error';
      requestId: string;
      reason: 'invalid_request' | 'no_permission' | 'unreachable';
      message: string;
    };

export function isPageRequest(data: unknown): data is PageRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'source' in data &&
    data.source === PAGE_SOURCE &&
    'type' in data &&
    (data.type === 'ping' || data.type === 'request')
  );
}

export function requiredOrigins(): string[] {
  const adminOrigins = (ext.runtime.getManifest().content_scripts ?? []).flatMap(
    (contentScript) => contentScript.matches ?? []
  );
  return ['http://*.local/*', ...adminOrigins];
}

export function localOrigins(): string[] {
  return ext.runtime.getManifest().optional_host_permissions ?? [];
}

export async function missingOrigins(): Promise<string[]> {
  const origins = requiredOrigins();
  const granted = await Promise.all(
    origins.map((origin) => ext.permissions.contains({ origins: [origin] }))
  );
  return origins.filter((_, index) => !granted[index]);
}
