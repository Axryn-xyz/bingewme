import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFile, uploadProgress, formatBytes } from '../src/lib/upload.ts';

test('large upload counters calculate percentage, speed and ETA without buffering the file', () => {
  const total = 1.5 * 1024 ** 3;
  const progress = uploadProgress(total / 2, total, 10000);
  assert.equal(progress.percent, 50);
  assert.equal(progress.remainingSeconds, 10);
  assert.equal(formatBytes(total), '1.50 GB');
  assert.equal(uploadProgress(0, total, 0).remainingSeconds, null);
  assert.equal(uploadProgress(total, total, 20000).phase, 'finishing');
});

test('XHR upload reports real byte progress, waits for server completion, and supports cancellation', async () => {
  const saved = globalThis.XMLHttpRequest;
  const instances = [];
  class XHR {
    constructor() {
      this.upload = {};
      this.headers = {};
      instances.push(this);
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(key, value) {
      this.headers[key] = value;
    }
    send(body) {
      this.body = body;
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
  }
  globalThis.XMLHttpRequest = XHR;
  try {
    const file = new File(['sample'], 'video.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 1.5 * 1024 ** 3 });
    const updates = [],
      abort = new AbortController();
    const pending = uploadFile('/api/upload', file, 'token', abort.signal, (progress) =>
      updates.push(progress),
    );
    const xhr = instances[0];
    assert.equal(xhr.body, file);
    assert.equal(xhr.headers.Authorization, 'Bearer token');
    xhr.upload.onprogress({ loaded: file.size / 2, total: file.size, lengthComputable: true });
    assert.equal(updates.at(-1).percent, 50);
    xhr.upload.onload();
    assert.equal(updates.at(-1).phase, 'finishing');
    xhr.status = 201;
    xhr.responseText = JSON.stringify({ item: { id: 'shared' } });
    xhr.onload();
    assert.equal((await pending).item.id, 'shared');
    abort.abort();
    assert.notEqual(xhr.aborted, true);
    const cancelled = new AbortController();
    const upload = uploadFile('/api/upload', file, 'token', cancelled.signal, () => {});
    const rejected = assert.rejects(upload, { name: 'AbortError' });
    cancelled.abort();
    await rejected;
    assert.equal(instances[1].aborted, true);
    const failed = uploadFile('/api/upload', file, 'token', new AbortController().signal, () => {});
    const tooLarge = assert.rejects(failed, /larger than the hosting service/);
    instances[2].status = 413;
    instances[2].responseText = '<html>Too large</html>';
    instances[2].onload();
    await tooLarge;
  } finally {
    globalThis.XMLHttpRequest = saved;
  }
});
