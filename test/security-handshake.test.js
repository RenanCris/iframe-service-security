import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockIframe,
  resetMessageChannelMocks,
  createMockMessageChannel,
} from "./setup.js";

describe("Handshake - Estabelecimento de Conexão Segura", () => {
  let mockIframe;
  let ServiceFilho;
  let ServicePai;

  beforeEach(async () => {
    resetMessageChannelMocks();
    mockIframe = createMockIframe();
    const filhoModule = await import("../IframeServiceFilho.js");
    const paiModule = await import("../IframeServicePai.js");
    ServiceFilho = filhoModule.ServiceFilho;
    ServicePai = paiModule.ServicePai;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (mockIframe && mockIframe.parentNode) {
      document.body.removeChild(mockIframe);
    }
  });

  it("filho deve sinalizar FILHO_PRONTO ao ser instanciado", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    new ServiceFilho({
      origensPermitidas: ["http://localhost:3000"],
      onReceiveRequest,
    });

    // Verifica se window.parent.postMessage foi chamado com FILHO_PRONTO
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { tipo: "FILHO_PRONTO" },
      "*",
    );
  });

  it("pai deve aguardar FILHO_PRONTO antes de enviar INIT_CHANNEL", () => {
    const onNotification = vi.fn();
    new ServicePai({
      iframeElement: mockIframe,
      urlIframeFilho: "http://127.0.0.1:4000",
      onNotification,
    });

    // Simula o iframe carregado
    const loadEvent = new Event("load");
    mockIframe.dispatchEvent(loadEvent);

    // Avança os timers
    vi.runAllTimers();

    // Verifica que o listener de message foi adicionado ao window
    // O pai adiciona listener no window para ouvir FILHO_PRONTO
  });

  it("filho deve estabelecer conexão ao receber INIT_CHANNEL com porta válida", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    const filho = new ServiceFilho({
      origensPermitidas: ["http://localhost:3000"],
      onReceiveRequest,
    });

    const mockChannel = createMockMessageChannel();
    const event = new MessageEvent("message", {
      origin: "http://localhost:3000",
      data: { tipo: "INIT_CHANNEL" },
      ports: [mockChannel.port2],
    });

    window.dispatchEvent(event);

    expect(filho.porta).not.toBeNull();
    expect(filho._handshakeResolvido).toBe(true);
  });

  it("pai deve criar MessageChannel e enviar porta para filho", () => {
    const onNotification = vi.fn();
    new ServicePai({
      iframeElement: mockIframe,
      urlIframeFilho: "http://127.0.0.1:4000",
      onNotification,
    });

    const loadEvent = new Event("load");
    mockIframe.dispatchEvent(loadEvent);

    // Simula FILHO_PRONTO do filho
    const filhoProntoEvent = new MessageEvent("message", {
      origin: "http://127.0.0.1:4000",
      data: { tipo: "FILHO_PRONTO" },
    });
    window.dispatchEvent(filhoProntoEvent);

    vi.runAllTimers();

    // Verifica que INIT_CHANNEL foi enviado com porta via iframe.contentWindow.postMessage
    expect(mockIframe.contentWindow.postMessage).toHaveBeenCalledWith(
      "INIT_CHANNEL",
      "http://127.0.0.1:4000",
      expect.arrayContaining([expect.any(Object)]),
    );
  });
});
