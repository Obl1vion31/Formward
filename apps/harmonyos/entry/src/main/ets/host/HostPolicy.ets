export const ORIGIN: string = 'https://formward.top';
export const IS_FIXTURE: boolean = false;
export const PRIVACY_VERSION: string = '2026-11-21';

/** Only exact HTTPS origin; reject userinfo, alternate ports, control characters and backslashes. */
export function isTrustedPage(value: string): boolean {
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
  const normalized = value.toLowerCase();
  const origin = ORIGIN.toLowerCase();
  const explicit = origin === 'https://formward.top' ? origin + ':443' : origin;
  return matchesOrigin(normalized, origin) || matchesOrigin(normalized, explicit);
}

function matchesOrigin(value: string, origin: string): boolean {
  return value === origin || value.startsWith(origin + '/') || value.startsWith(origin + '?') || value.startsWith(origin + '#');
}

export function isExternalLink(value: string): boolean {
  return !/[\u0000-\u0020\u007f\\]/.test(value) &&
    /^https:\/\/[^/@?#]+(?:[/?#]|$)/i.test(value) && !isTrustedPage(value);
}

export function isTrustedDownload(value: string): boolean {
  return isTrustedPage(value) ||
    (value.startsWith('blob:') && isTrustedPage(value.substring(5)));
}

export function safeExportName(value: string): string {
  const name = value.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').trim();
  if (!/\.(xlsx|csv|tsv)$/i.test(name) || name.startsWith('.')) return '';
  return name.length <= 120 ? name : 'Formward-export' + name.substring(name.lastIndexOf('.'));
}

export interface HostEvent {
  type: string;
  id?: string;
  handled?: boolean;
  theme?: string;
}

/** The proxy never exposes files, credentials, record contents or arbitrary native calls. */
export class HostBridge {
  private receive: (event: HostEvent) => void;
  constructor(receive: (event: HostEvent) => void) {
    this.receive = receive;
  }
  postEvent(message: string): void {
    if (message.length > 512) return;
    try {
      const event: HostEvent = JSON.parse(message) as HostEvent;
      if (event.type === 'ready' || event.type === 'appearance' ||
        event.type === 'back-pending' || event.type === 'back-result') this.receive(event);
    } catch (_) {}
  }
}
