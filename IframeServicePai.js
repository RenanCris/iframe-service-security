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
   */
  constructor({ iframeElement, urlIframeFilho, onNotification }) {
    this.iframe = iframeElement;
    this.urlFilho = urlIframeFilho;
    this.onNotification = onNotification;
    this.porta = null;
    this.transacoes = new Map();
    this._filhoPronto = false;

    this._conectar();
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
          this._enviarCanalSeguro();
        }
      };
      window.addEventListener("message", handlerFilhoPronto);

      // Timeout de segurança caso o filho não sinalize pronto
      setTimeout(() => {
        if (!this._filhoPronto) {
          window.removeEventListener("message", handlerFilhoPronto);
          console.warn(
            "⚠️ [PAI] Timeout aguardando filho sinalizar pronto. Tentando conectar mesmo assim...",
          );
          this._enviarCanalSeguro();
        }
      }, 2000);
    };

    if (this.iframe.contentDocument?.readyState === "complete") {
      inicializar();
    } else {
      this.iframe.addEventListener("load", inicializar, { once: true });
    }
  }

  _enviarCanalSeguro() {
    const canal = new MessageChannel();
    this.porta = canal.port1;

    this.porta.onmessage = (event) => {
      if (!event.data) return;
      const { nonce, dados, erro, acao, tipo } = event.data;

      // Valida se o nonce corresponde a uma transação aberta
      if (nonce && this.transacoes.has(nonce)) {
        const { resolve, reject } = this.transacoes.get(nonce);
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
  }

  /**
   * Envia um comando e aguarda a Promise usando o Nonce exclusivo
   */
  requisitar(acao, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!this.porta) return reject(new Error("Canal não inicializado."));

      const nonce = this._gerarNonce();
      this.transacoes.set(nonce, { resolve, reject });

      this.porta.postMessage({ nonce, acao, payload });
    });
  }

  destroy() {
    if (this.porta) this.porta.close();
    this.transacoes.clear();
  }
}
