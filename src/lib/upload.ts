export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
  remainingSeconds: number | null;
  phase: 'checking' | 'uploading' | 'finishing';
}

export function uploadProgress(loaded: number, total: number, elapsedMs: number): UploadProgress {
  const bytesPerSecond = elapsedMs > 0 ? loaded / (elapsedMs / 1000) : 0;
  return {
    loaded,
    total,
    percent: total > 0 ? Math.min(100, (loaded / total) * 100) : 0,
    bytesPerSecond,
    remainingSeconds: bytesPerSecond > 0 ? Math.max(0, (total - loaded) / bytesPerSecond) : null,
    phase: loaded >= total ? 'finishing' : 'uploading',
  };
}

export function uploadFile<T>(
  url: string,
  file: File,
  token: string,
  signal: AbortSignal,
  onProgress: (progress: UploadProgress) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Upload cancelled.', 'AbortError'));
    const xhr = new XMLHttpRequest();
    const started = performance.now();
    let lastUpdate = -Infinity;
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      const now = performance.now();
      if (now - lastUpdate < 100 && event.loaded < event.total) return;
      lastUpdate = now;
      onProgress(
        uploadProgress(
          event.loaded,
          event.lengthComputable ? event.total : file.size,
          now - started,
        ),
      );
    };
    xhr.upload.onload = () =>
      onProgress({
        ...uploadProgress(file.size, file.size, performance.now() - started),
        phase: 'finishing',
      });
    xhr.onload = () => {
      cleanup();
      let data: T & { error?: string };
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(
          new Error(
            xhr.status === 413
              ? 'This upload is larger than the hosting service allows.'
              : 'The room server did not return a valid upload response.',
          ),
        );
      }
      if (xhr.status < 200 || xhr.status >= 300)
        return reject(new Error(data.error || 'Upload failed. Please try again.'));
      resolve(data);
    };
    xhr.onerror = () => {
      cleanup();
      reject(
        new Error('The upload connection was interrupted. Check your connection and try again.'),
      );
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    onProgress(uploadProgress(0, file.size, 0));
    xhr.send(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, bytes / 1024).toFixed(0)} KB`;
}
