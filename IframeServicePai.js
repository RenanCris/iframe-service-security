/**
 * Comunicador seguro para a página Pai (host) que hospeda o iframe
 *
 * Uso:
 * ```js
 * const pai = IframeServiceSecurity.criarInstanciaPai({
 *   iframeElement: document.getElementById('meuIframe'),
 *   urlIframeFilho: 'http://localhost:4000',
 *   onNotification: (acao, payload) => { console.log('Notificação:', acao, payload) }
 * });
 *
 * // Requisição assíncrona (request-response)
 * const resposta = await pai.requisitar('obterPerfil', { id: 123 });
 *
 * // Limpeza
 * pai.destroy();
 * ```
 */
import { PROTOCOLO } from "./index.js";

export class ServicePai {
  /**
   * @param {Object} opcoes
   * @param {HTMLIFrameElement} opcoes.iframeElement - Elemento <iframe> do DOM
   * @param {string} opcoes.urlIframeFilho - URL completa do iframe filho (ex: 'http://localhost:4000')
   * @param {Function} opcoes.onNotification - Callback para notificações unilaterais do filho
   *   @param {string} opcoes.onNotification.acao - Nome da ação/notificação
   *   @param {Object} opcoes.onNotification.payload - Dados enviados pelo filho
   * @param {number} [opcoes.timeoutHandshakeMs=5000] - Timeout para o handshake inicial (ms)
   * @param {number} [opcoes.timeoutRequisicaoMs=10000] - Timeout para cada requisição (ms)
   */
  constructor({ iframeElement, urlIframeFilho, onNotification, timeoutHandshakeMs = 5000, timeoutRequisicaoMs = 10000 }) {
    if (!iframeElement || !(iframeElement instanceof HTMLIFrameElement)) {
      throw new TypeError("iframeElement must be an HTMLIFrameElement");
    }
    if (!urlIframeFilho) {
      throw new TypeError("urlIframeFilho is required");
    }

    this.iframe = iframeElement;
    this.urlFilho = urlIframeFilho;
    try {
      this.childOrigin = new URL(urlIframeFilho).origin;
    } catch (err) {
      throw new Error(`Invalid urlIframeFilho: ${err.message}`);
    }
    this.onNotification = onNotification;
    this.porta = null;
    this.transacoes = new Map();
    this._filhoPronto = false;
    this.timeoutHandshakeMs = timeoutHandshakeMs;
    this.timeoutRequisicaoMs = timeoutRequisicaoMs;
    this._timerHandshake = null;
    this._destruido = false;

    this._pronto = new Promise((resolve, reject) => {
      this._resolverPronto = (...args) => {
        // null out after use to avoid double-calls
        if (this._resolverPronto) {
          resolve(...args);
          this._resolverPronto = null;
          this._rejeitarPronto = null;
        }
      };
      this._rejeitarPronto = (err) => {
        if (this._rejeitarPronto) {
          reject(err);
          this._resolverPronto = null;
          this._rejeitarPronto = null;
        }
      };
    });

    // keep a reference so we can remove it in destroy()
    this._handlerFilhoPronto = null;

    this._conectar();
  }

  aguardarConexao() {
    return this._pronto;
  }

  // Gera um UUIDv4 (Nonce) nativo ou fallback matemático rápido
  _gerarNonce() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  _conectar() {
    const inicializar = () => {
      // clean up any previous handler just in case
      if (this._handlerFilhoPronto) {
        window.removeEventListener("message", this._handlerFilhoPronto);
        this._handlerFilhoPronto = null;
      }

      this._handlerFilhoPronto = (event) => {
        // Validate origin strictly using computed childOrigin
        if (event.origin !== this.childOrigin && event.origin !== "null") return;
        if (event.data?.tipo === PROTOCOLO.FILHO_PRONTO) {
          this._filhoPronto = true;
          window.removeEventListener("message", this._handlerFilhoPronto);
          clearTimeout(this._timerHandshake);
          this._handlerFilhoPronto = null;
          try {
            this._enviarCanalSeguro();
          } catch (err) {
            this._rejeitarPronto?.(new Error(`Falha ao enviar canal seguro: ${err.message}`));
          }
        }
      };

      window.addEventListener("message", this._handlerFilhoPronto);

      this._timerHandshake = setTimeout(() => {
        window.removeEventListener("message", this._handlerFilhoPronto);
        this._handlerFilhoPronto = null;
        if (this._filhoPronto || this.porta) return;

        console.warn(
          "⚠️ [PAI] Filho não sinalizou pronto no tempo esperado. Tentando enviar canal mesmo assim...",
        );
        try {
          this._enviarCanalSeguro();
        } catch (err) {
          this._rejeitarPronto?.(new Error(`Falha ao inicializar canal após timeout: ${err.message}`));
        }
      }, this.timeoutHandshakeMs);
    };

    if (this.iframe.contentWindow && this.iframe.contentWindow.document) { }
    this.iframe.addEventListener("load", inicializar, { once: true });

    if (this.iframe.contentWindow && this.iframe.src) {
      Promise.resolve().then(inicializar);
    }
  }

  _enviarCanalSeguro() {
    if (this.porta) return;

    const canal = new MessageChannel();
    this.porta = canal.port1;
    const remotePort = canal.port2;

    if (this.porta.start) this.porta.start();

    this.porta.onmessage = (event) => {
      try {
        if (!event.data) return;
        const { nonce, dados, erro, acao, tipo } = event.data;

        if (nonce && this.transacoes.has(nonce)) {
          const { resolve, reject, timer } = this.transacoes.get(nonce);
          clearTimeout(timer);
          this.transacoes.delete(nonce);
          if (erro) reject(new Error(erro));
          else resolve(dados);
          return;
        }

        if (tipo === PROTOCOLO.NOTIFICACAO && this.onNotification) {
          this.onNotification(acao, dados);
        }
      } catch (err) {
        // be defensive: don't let exceptions escape message handler
        console.error("[PAI] erro ao processar mensagem da porta:", err);
      }
    };

    // Post the remote port to the child using the child's origin (not the full URL)
    try {
      this.iframe.contentWindow.postMessage(PROTOCOLO.INIT_CHANNEL, this.childOrigin, [remotePort]);
      console.log("🚀 [PAI] Canal seguro enviado para o Filho.");
      this._resolverPronto?.();
      // After resolving, clear the handshake timer if still set
      clearTimeout(this._timerHandshake);
      this._timerHandshake = null;
    } catch (err) {
      // cleanup
      try { remotePort.close?.(); } catch (_) { }
      try { this.porta.close?.(); } catch (_) { }
      this.porta = null;
      throw err;
    }
  }

  /**
   * Envia um comando e aguarda a Promise usando o Nonce exclusivo.
   * Espera o handshake antes de postar; aplica timeout por requisição.
   *
   * @param {string} acao
   * @param {Object} payload
   * @param {Object} [opcoes]
   * @param {number} [opcoes.timeoutMs] - Override do timeout desta requisição
   */
  async requisitar(acao, payload = {}, { timeoutMs } = {}) {
    if (this._destruido) {
      throw new Error("Serviço destruído.");
    }

    await this._pronto; // allows rejection to propagate to caller

    if (!this.porta) {
      throw new Error("Canal não inicializado (porta indisponível).");
    }

    const efetivoTimeout = timeoutMs ?? this.timeoutRequisicaoMs;

    return new Promise((resolve, reject) => {
      const nonce = this._gerarNonce();

      const timer = setTimeout(() => {
        if (this.transacoes.has(nonce)) {
          this.transacoes.delete(nonce);
          reject(new Error(`Timeout de ${efetivoTimeout}ms na requisição "${acao}".`));
        }
      }, efetivoTimeout);

      this.transacoes.set(nonce, { resolve, reject, timer });

      try {
        this.porta.postMessage({ nonce, acao, payload });
      } catch (err) {
        clearTimeout(timer);
        this.transacoes.delete(nonce);
        reject(err);
      }
    });
  }

  destroy() {
    this._destruido = true;
    clearTimeout(this._timerHandshake);
    this._timerHandshake = null;

    // Remove global message listener if present
    if (this._handlerFilhoPronto) {
      window.removeEventListener("message", this._handlerFilhoPronto);
      this._handlerFilhoPronto = null;
    }

    // Rejeita transações abertas
    for (const [, { reject, timer }] of this.transacoes) {
      clearTimeout(timer);
      try { reject(new Error("Serviço destruído antes da resposta.")); } catch (_) { }
    }
    this.transacoes.clear();

    // Rejeita _pronto caso ninguém tenha resolvido ainda
    this._rejeitarPronto?.(new Error("Serviço destruído durante handshake."));
    this._resolverPronto = null;
    this._rejeitarPronto = null;

    if (this.porta) {
      try { this.porta.onmessage = null; } catch (_) { }
      try { this.porta.close?.(); } catch (_) { }
      this.porta = null;
    }
  }
}
