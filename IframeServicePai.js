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
    this.iframe = iframeElement;
    this.urlFilho = urlIframeFilho;
    this.onNotification = onNotification;
    this.porta = null;
    this.transacoes = new Map();
    this._filhoPronto = false;
    this.timeoutHandshakeMs = timeoutHandshakeMs;
    this.timeoutRequisicaoMs = timeoutRequisicaoMs;

    this._pronto = new Promise((resolve, reject) => {
      this._resolverPronto = resolve;
      this._rejeitarPronto = reject;
    });
    this._pronto.catch(() => { });

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
      // Escuta o sinal de "FILHO_PRONTO" antes de enviar INIT_CHANNEL
      const handlerFilhoPronto = (event) => {
        if (event.origin !== this.urlFilho && event.origin !== "null") return;
        if (event.data?.tipo === PROTOCOLO.FILHO_PRONTO) {
          this._filhoPronto = true;
          window.removeEventListener("message", handlerFilhoPronto);
          clearTimeout(this._timerHandshake);
          this._enviarCanalSeguro();
        }
      };
      window.addEventListener("message", handlerFilhoPronto);

      this._timerHandshake = setTimeout(() => {
        window.removeEventListener("message", handlerFilhoPronto);
        if (this._filhoPronto || this.porta) return;

        console.warn(
          "⚠️ [PAI] Filho não sinalizou pronto no tempo esperado. Tentando enviar canal mesmo assim...",
        );
        try {
          this._enviarCanalSeguro();
        } catch (err) {
          this._rejeitarPronto(
            new Error(
              `Falha ao inicializar canal após timeout: ${err.message}`,
            ),
          );
        }
      }, this.timeoutHandshakeMs);
    };

    if (this.iframe.contentDocument?.readyState === "complete") {
      inicializar();
    } else {
      this.iframe.addEventListener("load", inicializar, { once: true });
    }
  }

  _enviarCanalSeguro() {
    if (this.porta) return;

    const canal = new MessageChannel();
    this.porta = canal.port1;

    this.porta.onmessage = (event) => {
      if (!event.data) return;
      const { nonce, dados, erro, acao, tipo } = event.data;

      // Valida se o nonce corresponde a uma transação aberta
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
    };

    // 🔒 O navegador entrega a porta estritamente para a URL alvo
    this.iframe.contentWindow.postMessage(
      PROTOCOLO.INIT_CHANNEL,
      this.urlFilho,
      [canal.port2],
    );
    console.log("🚀 [PAI] Canal seguro enviado para o Filho.");
    this._resolverPronto();
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

    // ⏳ Espera o canal ficar pronto (com timeout global do handshake)
    await this._pronto;

    if (!this.porta) {
      throw new Error("Canal não inicializado (porta indisponível).");
    }

    const efetivoTimeout = timeoutMs ?? this.timeoutRequisicaoMs;

    return new Promise((resolve, reject) => {
      const nonce = this._gerarNonce();

      const timer = setTimeout(() => {
        if (this.transacoes.has(nonce)) {
          this.transacoes.delete(nonce);
          reject(
            new Error(
              `Timeout de ${efetivoTimeout}ms na requisição "${acao}".`,
            ),
          );
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

    // Rejeita transações abertas
    for (const [, { reject, timer }] of this.transacoes) {
      clearTimeout(timer);
      reject(new Error("Serviço destruído antes da resposta."));
    }
    this.transacoes.clear();

    // Rejeita _pronto caso ninguém tenha resolvido ainda
    this._rejeitarPronto(new Error("Serviço destruído durante handshake."));

    if (this.porta) {
      this.porta.close();
      this.porta = null;
    }
  }
}
