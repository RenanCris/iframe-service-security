// @vitest-environment happy-dom
import { vi } from "vitest";

// Polyfill para crypto.randomUUID se não disponível
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}

// Mock do console para testes limpos
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Configuração global do happy-dom
global.window = window;
global.document = document;

// Criar mock para window.parent.postMessage (usado pelo filho)
const mockParentPostMessage = vi.fn();
window.parent = {
  postMessage: mockParentPostMessage,
  origin: "http://localhost:3000",
};

// Rastrear event listeners adicionados ao window para limpeza
const windowMessageListeners = [];
const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;

window.addEventListener = vi.fn((event, handler, options) => {
  if (event === "message") {
    windowMessageListeners.push({ event, handler, options });
  }
  return originalAddEventListener.call(window, event, handler, options);
});

window.removeEventListener = vi.fn((event, handler, options) => {
  const idx = windowMessageListeners.findIndex(
    (l) => l.handler === handler && l.event === event,
  );
  if (idx !== -1) {
    windowMessageListeners.splice(idx, 1);
  }
  return originalRemoveEventListener.call(window, event, handler, options);
});

// Array para guardar mocks criados
let messageChannelMocks = [];

// Mock global do MessageChannel - cria portas conectadas
class MockMessageChannel {
  constructor() {
    const port1 = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null,
      start: vi.fn(),
    };
    const port2 = {
      postMessage: vi.fn(),
      close: vi.fn(),
      onmessage: null,
      start: vi.fn(),
    };

    // Conectar as portas bidirecionalmente
    port1.postMessage.mockImplementation((msg) => {
      if (port2.onmessage) {
        port2.onmessage({
          data: msg,
          origin: "http://127.0.0.1:4000",
          ports: [],
          source: port2,
        });
      }
    });

    port2.postMessage.mockImplementation((msg) => {
      if (port1.onmessage) {
        port1.onmessage({
          data: msg,
          origin: "http://localhost:3000",
          ports: [],
          source: port1,
        });
      }
    });

    port1.close.mockImplementation(() => {
      port1.onmessage = null;
    });

    port2.close.mockImplementation(() => {
      port2.onmessage = null;
    });

    this.port1 = port1;
    this.port2 = port2;

    messageChannelMocks.push({ port1, port2, instance: this });
  }
}

window.MessageChannel = MockMessageChannel;

// Função para criar um novo MessageChannel mockado (útil para testes)
export function createMockMessageChannel() {
  return new MockMessageChannel();
}

// Função para resetar mocks do MessageChannel
export function resetMessageChannelMocks() {
  messageChannelMocks = [];
  mockParentPostMessage.mockClear();
  // Limpar event listeners do window
  windowMessageListeners.forEach(({ event, handler, options }) => {
    originalRemoveEventListener.call(window, event, handler, options);
  });
  windowMessageListeners.length = 0;
  window.addEventListener.mockClear();
  window.removeEventListener.mockClear();
}

// Função para obter a última instância de MessageChannel criada
export function getLastMessageChannelMock() {
  return messageChannelMocks[messageChannelMocks.length - 1];
}

global.MessageChannel = window.MessageChannel;
global.MessagePort = window.MessagePort;

/**
 * Cria um iframe mockado para testes
 */
export function createMockIframe() {
  const iframe = document.createElement("iframe");
  let capturedPort = null;
  let capturedPorts = [];

  const mockContentWindow = {
    postMessage: vi.fn((_message, _targetOrigin, ports) => {
      if (ports && ports.length > 0) {
        capturedPort = ports[0];
        capturedPorts.push(...ports);
      }
    }),
    location: { origin: "http://127.0.0.1:4000" },
    document: {
      readyState: "complete",
    },
    _getCapturedPort: () => capturedPort,
    _getCapturedPorts: () => capturedPorts,
  };

  Object.defineProperty(iframe, "contentWindow", {
    value: mockContentWindow,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(iframe, "contentDocument", {
    value: mockContentWindow.document,
    writable: true,
    configurable: true,
  });

  document.body.appendChild(iframe);

  return iframe;
}

/**
 * Cria duas portas MessageChannel conectadas entre si
 */
export function createConnectedPorts() {
  const channel = new MessageChannel();
  return {
    port1: channel.port1,
    port2: channel.port2,
  };
}
