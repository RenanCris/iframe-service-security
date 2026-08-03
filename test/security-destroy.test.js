import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockIframe,
  resetMessageChannelMocks,
  createMockMessageChannel,
} from "./setup.js";

describe("Destroy - Limpeza e Encerramento de Conexão", () => {
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

  it("filho.destroy() deve fechar a porta MessageChannel", () => {
    const onReceiveRequest = vi.fn().mockResolvedValue({ status: "ok" });
    const filho = new ServiceFilho({
      origensPermitidas: ["http://localhost:3000"],
      onReceiveRequest,
    });

    // Criar um MessageChannel mockado para estabelecer a conexão
    const mockChannel = createMockMessageChannel();
    const event = new MessageEvent("message", {
      origin: "http://localhost:3000",
      data: { tipo: "INIT_CHANNEL" },
      ports: [mockChannel.port2],
    });

    window.dispatchEvent(event);

    expect(filho.porta).not.toBeNull();

    // Chama destroy
    filho.destroy();

    // Verifica que a porta foi fechada
    expect(filho.porta.close).toHaveBeenCalled();
    // O destroy original não zera this.porta, apenas fecha
  });

  it("pai.destroy() deve fechar a porta e limpar transações pendentes", () => {
    const onNotification = vi.fn();
    const pai = new ServicePai({
      iframeElement: mockIframe,
      urlIframeFilho: "http://127.0.0.1:4000",
      onNotification,
    });

    const loadEvent = new Event("load");
    mockIframe.dispatchEvent(loadEvent);

    const filhoProntoEvent = new MessageEvent("message", {
      origin: "http://127.0.0.1:4000",
      data: { tipo: "FILHO_PRONTO" },
    });
    window.dispatchEvent(filhoProntoEvent);

    vi.runAllTimers();

    expect(pai.porta).not.toBeNull();

    // Chama destroy
    pai.destroy();

    // Verifica que a porta foi fechada
    expect(pai.porta.close).toHaveBeenCalled();
    // O destroy original não zera this.porta, apenas fecha e limpa transações
    // Verifica que as transações foram limpas
    expect(pai.transacoes.size).toBe(0);
  });

  it("filho.destroy() deve ser idempotente (pode ser chamado múltiplas vezes sem erro)", () => {
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

    // Primeira chamada
    filho.destroy();
    expect(filho.porta.close).toHaveBeenCalledTimes(1);

    // Segunda chamada não deve lançar erro
    expect(() => filho.destroy()).not.toThrow();
    // O close é chamado novamente pois o destroy não verifica se já foi fechado
    // O importante é que não lança erro
  });

  it("pai.destroy() deve limpar transações pendentes (promises ficam pendentes)", async () => {
    const onNotification = vi.fn();
    const pai = new ServicePai({
      iframeElement: mockIframe,
      urlIframeFilho: "http://127.0.0.1:4000",
      onNotification,
    });

    const loadEvent = new Event("load");
    mockIframe.dispatchEvent(loadEvent);

    const filhoProntoEvent = new MessageEvent("message", {
      origin: "http://127.0.0.1:4000",
      data: { tipo: "FILHO_PRONTO" },
    });
    window.dispatchEvent(filhoProntoEvent);

    vi.runAllTimers();

    // Inicia uma requisição (cria uma transação pendente)
    pai.requisitar("acaoTeste", { dado: 123 });

    // Verifica que a transação está pendente
    expect(pai.transacoes.size).toBe(1);

    // Chama destroy
    pai.destroy();

    // Verifica que as transações foram limpas
    expect(pai.transacoes.size).toBe(0);

    // Nota: A implementação atual não rejeita as promises pendentes ao chamar destroy
    // As promises ficam pendentes indefinidamente (comportamento atual)
    // Se necessário, aguardar timeout ou cancelar manualmente
  }, 5000);
});
