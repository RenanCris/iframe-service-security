import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockIframe,
  resetMessageChannelMocks,
  createMockMessageChannel,
} from "./setup.js";

describe("Segurança na Origem - Validação de Origem", () => {
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

  it("deve rejeitar conexões de origens não autorizadas", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    const filho = new ServiceFilho({
      origensPermitidas: ["http://localhost:3000"],
      onReceiveRequest,
    });

    // Criar um MessageChannel mockado manualmente para o teste
    const mockChannel = createMockMessageChannel();

    const event = new MessageEvent("message", {
      origin: "http://malicious-site.com",
      data: { tipo: "INIT_CHANNEL" },
      ports: [mockChannel.port2],
    });

    window.dispatchEvent(event);

    expect(filho.porta).toBeNull();
    expect(onReceiveRequest).not.toHaveBeenCalled();
  });

  it("deve aceitar conexões de origens permitidas", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    const filho = new ServiceFilho({
      origensPermitidas: ["http://localhost:3000", "http://127.0.0.1:3000"],
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
  });

  it("deve permitir origem 'null' quando lista não contém 'null' explicitamente", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    const filho = new ServiceFilho({
      origensPermitidas: ["http://localhost:3000"],
      onReceiveRequest,
    });

    const mockChannel = createMockMessageChannel();
    const event = new MessageEvent("message", {
      origin: "null",
      data: { tipo: "INIT_CHANNEL" },
      ports: [mockChannel.port2],
    });

    window.dispatchEvent(event);

    expect(filho.porta).not.toBeNull();
  });

  it("deve aceitar origem 'null' quando 'null' está explicitamente na lista", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    const filho = new ServiceFilho({
      origensPermitidas: ["null", "http://localhost:3000"],
      onReceiveRequest,
    });

    const mockChannel = createMockMessageChannel();
    const event = new MessageEvent("message", {
      origin: "null",
      data: { tipo: "INIT_CHANNEL" },
      ports: [mockChannel.port2],
    });

    window.dispatchEvent(event);

    expect(filho.porta).not.toBeNull();
  });
});
