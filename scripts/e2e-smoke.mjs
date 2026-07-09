import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const appPort = Number(process.env.MARBLEDLE_E2E_PORT ?? 3200);
const debugPort = Number(process.env.MARBLEDLE_E2E_DEBUG_PORT ?? 9322);
const appUrl = `http://localhost:${appPort}`;
const chromePath = findChrome();
const errors = [];
const warnings = [];

let serverProcess;
let chromeProcess;
let userDataDir;

try {
  serverProcess = startNextServer(appPort);
  await waitForHttp(appUrl, 90_000);

  userDataDir = await mkdtemp(join(tmpdir(), "marbledle-e2e-chrome-"));
  chromeProcess = startChrome(chromePath, debugPort, userDataDir);

  const pageWsUrl = await createChromePage(debugPort);
  const cdp = await connectCdp(pageWsUrl);
  await enableBrowserDiagnostics(cdp);

  cdp.on("Runtime.consoleAPICalled", (event) => {
    const text = event.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
    if (event.type === "error") errors.push(`console error: ${text}`);
    if (event.type === "warning") warnings.push(`console warning: ${text}`);
  });
  cdp.on("Runtime.exceptionThrown", (event) => {
    errors.push(`page exception: ${event.exceptionDetails.text}`);
  });
  cdp.on("Log.entryAdded", (event) => {
    if (event.entry.level === "error") errors.push(`log error: ${event.entry.text}`);
    if (event.entry.level === "warning") warnings.push(`log warning: ${event.entry.text}`);
  });

  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForLoad(cdp, 60_000);
  await waitForExpression(
    cdp,
    `Boolean(document.querySelector('canvas[aria-label="3D marble race"]'))`,
    60_000,
  );
  await waitForExpression(
    cdp,
    `document.body.innerText.includes('Playable, no assist')`,
    60_000,
  );

  const initial = await evaluate(cdp, `(() => {
    const canvas = document.querySelector('canvas[aria-label="3D marble race"]');
    const rect = canvas.getBoundingClientRect();
    const lock = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Lock guess'));
    return {
      title: document.querySelector('h1')?.textContent,
      canvas: { width: rect.width, height: rect.height },
      lockDisabled: lock?.disabled ?? null,
      status: document.body.innerText,
    };
  })()`);

  assert(initial.title === "Marbledle", "Expected Marbledle heading.");
  assert(initial.canvas.width > 300 && initial.canvas.height > 300, "Expected visible 3D canvas.");
  assert(initial.lockDisabled === true, "Expected Lock guess to be disabled before valid guesses.");

  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
  assert((screenshot.data?.length ?? 0) > 60_000, "Expected a non-trivial page screenshot.");

  await evaluate(cdp, `(() => {
    const inputs = [...document.querySelectorAll('input[pattern="[1-5]"]')];
    inputs.forEach((input, index) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(index + 1));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  })()`);
  await waitForExpression(
    cdp,
    `(() => {
      const lock = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Lock guess'));
      return lock && !lock.disabled;
    })()`,
    10_000,
  );
  await evaluate(cdp, `(() => {
    const lock = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Lock guess'));
    lock.click();
  })()`);
  await waitForExpression(cdp, `document.body.innerText.includes('Results locked')`, 10_000);

  const finalState = await evaluate(cdp, `(() => {
    const body = document.body.innerText.toLowerCase();
    return {
      hasAccuracy: body.includes('accuracy'),
      hasActual: body.includes('actual finish'),
      hasGuess: body.includes('your guess'),
      hasCourseCheck: body.includes('playable, no assist'),
      bodyExcerpt: document.body.innerText.slice(0, 1200),
    };
  })()`);
  assert(finalState.hasAccuracy, `Expected accuracy result.\n${finalState.bodyExcerpt}`);
  assert(finalState.hasActual, `Expected actual finish result.\n${finalState.bodyExcerpt}`);
  assert(finalState.hasGuess, `Expected guess result.\n${finalState.bodyExcerpt}`);
  assert(finalState.hasCourseCheck, `Expected playable course check.\n${finalState.bodyExcerpt}`);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  console.log("E2E smoke passed.");
  if (warnings.length > 0) {
    console.warn(warnings.join("\n"));
  }
} finally {
  await cleanup();
}

function startNextServer(port) {
  const bin = process.execPath;
  const nextCli = resolve("node_modules", "next", "dist", "bin", "next");
  const child = spawn(bin, [nextCli, "dev", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      errors.push(`Next server exited with code ${code}.`);
    }
  });

  return child;
}

function startChrome(executablePath, port, profileDir) {
  return spawn(
    executablePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function createChromePage(port) {
  await waitForHttp(`http://127.0.0.1:${port}/json/version`, 30_000);
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`, {
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`Could not create Chrome target: ${response.status}`);
  }
  const target = await response.json();
  return target.webSocketDebuggerUrl;
}

async function connectCdp(wsUrl) {
  const ws = await createWebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let id = 0;

  ws.onMessage((data) => {
    const payload = JSON.parse(data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message));
      else resolve(payload.result ?? {});
      return;
    }
    if (payload.method && listeners.has(payload.method)) {
      listeners.get(payload.method).forEach((listener) => listener(payload.params ?? {}));
    }
  });

  return {
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
    send(method, params = {}) {
      id += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function createWebSocket(wsUrl) {
  const url = new URL(wsUrl);
  const socket = netConnect(Number(url.port), url.hostname);
  const key = randomBytes(16).toString("base64");
  const listeners = [];
  let buffer = Buffer.alloc(0);
  let handshaken = false;

  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(
        [
          `GET ${url.pathname}${url.search} HTTP/1.1`,
          `Host: ${url.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"),
      );
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!handshaken) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const header = buffer.slice(0, headerEnd).toString("utf8");
        if (!header.startsWith("HTTP/1.1 101")) {
          reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
          return;
        }

        const expectedAccept = createHash("sha1")
          .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        if (!header.includes(`Sec-WebSocket-Accept: ${expectedAccept}`)) {
          reject(new Error("WebSocket handshake accept key mismatch."));
          return;
        }

        handshaken = true;
        buffer = buffer.slice(headerEnd + 4);
        resolve();
      }

      flushFrames();
    });
  });

  function flushFrames() {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const opcode = first & 0x0f;
      const second = buffer[1];
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < offset + 2) return;
        length = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (buffer.length < offset + 8) return;
        const high = buffer.readUInt32BE(offset);
        const low = buffer.readUInt32BE(offset + 4);
        length = high * 2 ** 32 + low;
        offset += 8;
      }

      const masked = Boolean(second & 0x80);
      let mask;
      if (masked) {
        if (buffer.length < offset + 4) return;
        mask = buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + length) return;

      let payload = buffer.slice(offset, offset + length);
      buffer = buffer.slice(offset + length);

      if (masked && mask) {
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }

      if (opcode === 1) {
        listeners.forEach((listener) => listener(payload.toString("utf8")));
      } else if (opcode === 8) {
        socket.end();
      }
    }
  }

  return {
    onMessage(listener) {
      listeners.push(listener);
    },
    send(text) {
      socket.write(encodeWsTextFrame(text));
    },
    close() {
      socket.end();
    },
  };
}

function encodeWsTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const mask = randomBytes(4);
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x81, 0x80 | length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }

  const masked = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
  return Buffer.concat([header, mask, masked]);
}

async function enableBrowserDiagnostics(cdp) {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
}

function waitForLoad(cdp, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for page load.")), timeoutMs);
    cdp.on("Page.loadEventFired", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForExpression(cdp, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(cdp, expression);
    if (value) return value;
    await delay(250);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}

function findChrome() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Could not find Chrome or Edge. Set CHROME_EXECUTABLE_PATH to run e2e smoke.");
  }
  return found;
}

async function cleanup() {
  if (chromeProcess) killTree(chromeProcess.pid);
  if (serverProcess) killTree(serverProcess.pid);
  if (userDataDir) {
    await rm(userDataDir, { force: true, recursive: true }).catch(() => {});
  }
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
