import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import puppeteer from 'puppeteer-core';
import ts from 'typescript';

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error('Timeout: ' + name));
    }, 8000);
    const listener = (value) => {
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(value);
    };
    socket.on(name, listener);
  });
}
const request = (socket, name, data = {}) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(name, data, (error, response) => (error ? reject(error) : resolve(response))),
  );

test(
  'screen shares synchronize guests and late joins, relay signaling and stop on disconnect',
  { timeout: 20000 },
  async () => {
    const processServer = spawn(process.execPath, ['server/index.js'], {
      env: {
        ...process.env,
        PORT: '3004',
        TURN_URLS: 'turn:relay.example:3478',
        TURN_USERNAME: 'test',
        TURN_CREDENTIAL: 'test-secret',
      },
      stdio: 'pipe',
    });
    const sockets = [];
    try {
      await new Promise((resolve, reject) => {
        processServer.stdout.once('data', resolve);
        processServer.once('error', reject);
      });
      const join = async (name) => {
        const socket = io('http://localhost:3004', { transports: ['websocket'] });
        sockets.push(socket);
        await event(socket, 'connect');
        const session = event(socket, 'session');
        socket.emit('join', { room: 'screen-test', name });
        return { socket, session: await session };
      };
      const host = await join('Host'),
        guest = await join('Guest');
      assert.equal(host.session.iceServers[1].urls[0], 'turn:relay.example:3478');
      assert.equal(host.session.iceServers[1].username, 'test');
      const started = event(guest.socket, 'sync'),
        offerRequest = event(host.socket, 'share-request');
      assert.deepEqual(await request(host.socket, 'share-start'), { ok: true });
      assert.equal(await offerRequest, guest.socket.id);
      assert.deepEqual(await started, {
        source: '',
        title: 'Live screen share',
        mediaId: '',
        time: 0,
        playing: true,
        rate: 1,
      });
      const signal = event(guest.socket, 'signal');
      host.socket.emit('signal', {
        to: guest.socket.id,
        description: { type: 'offer', sdp: 'test-sdp' },
      });
      assert.equal((await signal).from, host.socket.id);
      const lateOffer = event(host.socket, 'share-request');
      const late = await join('Late viewer');
      assert.equal(await lateOffer, late.socket.id);
      const lateState = event(late.socket, 'sync');
      late.socket.emit('request-sync');
      assert.equal((await lateState).playing, true);
      const cameraState = event(guest.socket, 'camera-state'),
        cameraRequest = event(host.socket, 'camera-request');
      assert.deepEqual(await request(host.socket, 'camera-start', { video: true, audio: true }), {
        ok: true,
      });
      assert.equal((await cameraState)[0].id, host.socket.id);
      assert.ok([guest.socket.id, late.socket.id].includes(await cameraRequest));
      const cameraSignal = event(guest.socket, 'camera-signal');
      host.socket.emit('camera-signal', {
        to: guest.socket.id,
        publisher: host.socket.id,
        description: { type: 'offer', sdp: 'camera-sdp' },
      });
      assert.equal((await cameraSignal).publisher, host.socket.id);
      const cameraStopped = event(guest.socket, 'camera-stop');
      host.socket.emit('camera-stop');
      assert.equal(await cameraStopped, host.socket.id);
      const stopped = event(guest.socket, 'share-stop'),
        cleared = event(guest.socket, 'sync');
      host.socket.disconnect();
      await stopped;
      assert.equal((await cleared).playing, false);
      guest.socket.emit('settings', { locked: true });
      assert.match((await request(late.socket, 'share-start')).error, /Only the host/);
    } finally {
      sockets.forEach((socket) => socket.disconnect());
      processServer.kill();
    }
  },
);

test(
  'screen transport delivers real video frames and audio between browser pages and supports restarting',
  { timeout: 30000 },
  async () => {
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    let args = ['--autoplay-policy=no-user-gesture-required'];
    if (!executablePath && process.platform === 'linux') {
      const { default: chromium } = await import('@sparticuz/chromium');
      executablePath = await chromium.executablePath();
      args.push(...chromium.args);
    }
    executablePath ||= `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`;
    const browser = await puppeteer.launch({ executablePath, headless: true, args });
    try {
      const source = await readFile(new URL('../src/lib/screen-peers.ts', import.meta.url), 'utf8');
      const script =
        ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText + '\nwindow.ScreenPeers = ScreenPeers;';
      const host = await browser.newPage(),
        guest = await browser.newPage();
      for (const [page, other] of [
        [host, guest],
        [guest, host],
      ]) {
        await page.exposeFunction('sendSignal', async (_, signal) => {
          await other.evaluate((signal) => window.peer.signal('other', signal), signal);
        });
        await page.addScriptTag({ type: 'module', content: script });
        await page.waitForFunction(() => !!window.ScreenPeers);
        await page.evaluate(() => {
          window.errors = [];
          window.received = new Set();
          window.peer = new window.ScreenPeers(
            (id, signal) => {
              void window.sendSignal(id, signal).catch(() => {});
            },
            (stream) => {
              if (!stream) return;
              window.received.add(stream.id);
              const video =
                document.querySelector('video') ||
                document.body.appendChild(document.createElement('video'));
              video.srcObject = stream;
              video.muted = true;
              void video.play();
            },
            (error) => {
              if (error) window.errors.push(error);
            },
          );
          window.peer.configure([]);
        });
      }
      const share = () =>
        host.evaluate(async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const context = canvas.getContext('2d');
          window.frameTimer = setInterval(() => {
            context.fillStyle = `hsl(${Date.now() % 360} 80% 50%)`;
            context.fillRect(0, 0, 320, 180);
          }, 40);
          window.stream = canvas.captureStream(25);
          window.audio = new AudioContext();
          const oscillator = window.audio.createOscillator();
          const destination = window.audio.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          window.stream.addTrack(destination.stream.getAudioTracks()[0]);
          window.peer.setStream(window.stream);
          await window.peer.offer('other');
        });
      await share();
      await guest.waitForFunction(
        () =>
          document.querySelector('video')?.videoWidth === 320 &&
          document.querySelector('video').currentTime > 0.1,
        { timeout: 10000 },
      );
      assert.deepEqual(await guest.evaluate(() => window.errors), []);
      assert.equal(
        await guest.evaluate(
          () => document.querySelector('video').srcObject.getAudioTracks().length,
        ),
        1,
      );
      await host.evaluate(() => {
        clearInterval(window.frameTimer);
        window.stream.getTracks().forEach((track) => track.stop());
        window.peer.setStream(null);
        void window.audio.close();
      });
      await guest.evaluate(() => window.peer.close());
      await share();
      await guest.waitForFunction(
        () =>
          window.received.size >= 2 &&
          document.querySelector('video')?.videoWidth === 320 &&
          document.querySelector('video').currentTime > 0.1,
        { timeout: 10000 },
      );
      assert.deepEqual(await host.evaluate(() => window.errors), []);
    } finally {
      await browser.close();
    }
  },
);
