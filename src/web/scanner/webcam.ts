/**
 * Bridge between the capture services (plain functions) and the website card
 * scanner (web/components/WebCardScanner, mounted once in the root layout, web only).
 *  • openWebcam()      → live camera with card detection → corner adjust → cropped card
 *  • openCropper(uri)  → corner adjust on an uploaded photo (auto-detected first)
 * Both resolve with the straightened card, or null if the user closes it.
 */
export interface WebcamShot {
  uri: string; // JPEG data URL of the straightened card
  width: number;
  height: number;
}

export type ScannerRequest = { mode: 'camera' } | { mode: 'crop'; uri: string };
type Host = (req: ScannerRequest, resolve: (shot: WebcamShot | null) => void) => void;

let host: Host | null = null;

export function registerWebcamHost(h: Host | null) {
  host = h;
}

function open(req: ScannerRequest): Promise<WebcamShot | null> {
  return new Promise((resolve) => {
    if (!host) resolve(null);
    else host(req, resolve);
  });
}

export const openWebcam = () => open({ mode: 'camera' });
export const openCropper = (uri: string) => open({ mode: 'crop', uri });
