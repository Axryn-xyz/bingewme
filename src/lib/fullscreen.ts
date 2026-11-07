type SafariVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsFullscreen?: boolean;
};
type SafariElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };
type SafariDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => void | Promise<void>;
};

// Call native APIs synchronously from the button's click to retain Safari's user activation.
export function togglePlayerFullscreen(
  container: HTMLElement | null,
  video: HTMLVideoElement | null,
  doc: Document = document,
): Promise<void> {
  const safariDoc = doc as SafariDocument;
  const safariVideo = video as SafariVideo | null;
  if (doc.fullscreenElement) return doc.exitFullscreen();
  if (safariDoc.webkitFullscreenElement && safariDoc.webkitExitFullscreen)
    return Promise.resolve(safariDoc.webkitExitFullscreen());
  if (safariVideo?.webkitDisplayingFullscreen && safariVideo.webkitExitFullscreen)
    return Promise.resolve(safariVideo.webkitExitFullscreen());
  if (container?.requestFullscreen && doc.fullscreenEnabled !== false)
    return container.requestFullscreen();
  if ((container as SafariElement | null)?.webkitRequestFullscreen)
    return Promise.resolve((container as SafariElement).webkitRequestFullscreen!());
  if (safariVideo?.webkitEnterFullscreen && safariVideo.webkitSupportsFullscreen !== false)
    return Promise.resolve(safariVideo.webkitEnterFullscreen());
  throw new Error('Fullscreen is unavailable for this player on this device.');
}
