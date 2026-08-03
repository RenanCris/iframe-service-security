import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockIframe,
  resetMessageChannelMocks,
  createMockMessageChannel,
} from "./setup.js";

describe("Nonce-Transaction - Segurança de Transações com Nonce", () => {
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

  it("pai deve gerar nonce único para cada requisição", () => {
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

    // Faz duas requisições
    pai.requisitar("acao1", { id: 1 });
    pai.requisitar("acao2", { id: 2 });

    // Verifica que duas transações foram criadas com nonces diferentes
    expect(pai.transacoes.size).toBe(2);

    const nonces = Array.from(pai.transacoes.keys());
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it("filho deve responder com o mesmo nonce recebido", async () => {
    const respostaEsperada = { status: "sucesso", dados: { id: 123 } };
    const onReceiveRequest = vi.fn().mockResolvedValue(respostaEsperada);
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

    // Simula requisição do pai com nonce específico
    const nonceTeste = "teste-nonce-123";
    const canalEvent = {
      data: {
        nonce: nonceTeste,
        acao: "obterDados",
        payload: { id: 123 },
      },
    };

    // Dispara o onmessage na porta do filho
    if (filho.porta && filho.porta.onmessage) {
      await filho.porta.onmessage(canalEvent);
    }

    // Verifica que a resposta foi enviada com o mesmo nonce
    expect(filho.porta.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        nonce: nonceTeste,
        dados: respostaEsperada,
      }),
    );
  });

  it("pai deve resolver promise correta baseada no nonce da resposta", async () => {
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

    // Faz uma requisição
    const promise = pai.requisitar("acaoTeste", { id: 456 });

    // Obtém o nonce gerado
    const nonce = Array.from(pai.transacoes.keys())[0];
    expect(nonce).toBeDefined();

    // Simula resposta do filho com o mesmo nonce
    const respostaEvent = new MessageEvent("message", {
      data: {
        nonce: nonce,
        dados: { resultado: "ok" },
      },
    });

    if (pai.porta && pai.porta.onmessage) {
      pai.porta.onmessage(respostaEvent);
    }

    // Verifica que a promise foi resolvida com os dados corretos
    const resultado = await promise;
    expect(resultado).toEqual({ resultado: "ok" });
    // Verifica que a transação foi removida
    expect(pai.transacoes.has(nonce)).toBe(false);
  });

  it("pai deve rejeitar promise quando resposta contém erro", async () => {
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

    const promise = pai.requisitar("acaoComErro", { id: 789 });
    const nonce = Array.from(pai.transacoes.keys())[0];

    // Simula resposta de erro do filho
    const respostaEvent = new MessageEvent("message", {
      data: {
        nonce: nonce,
        erro: "Ação não suportada",
      },
    });

    if (pai.porta && pai.porta.onmessage) {
      pai.porta.onmessage(respostaEvent);
    }

    // Verifica que a promise foi rejeitada com o erro correto
    await expect(promise).rejects.toThrow("Ação não suportada");
    expect(pai.transacoes.has(nonce)).toBe(false);
  });

  it("pai deve ignorar respostas com nonce inexistente", () => {
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

    // Simula resposta com nonce que não existe
    const respostaEvent = new MessageEvent("message", {
      data: {
        nonce: "nonce-inexistente",
        dados: { resultado: "ok" },
      },
    });

    if (pai.porta && pai.porta.onmessage) {
      pai.porta.onmessage(respostaEvent);
    }

    // Não deve lançar erro e transações devem permanecer inalteradas
    expect(pai.transacoes.size).toBe(0);
  });
});
