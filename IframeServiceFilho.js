/**
 * Comunicador seguro para a página Filho (iframe) que roda dentro do host
 *
 * Uso:
 * ```js
 * const filho = IframeServiceSecurity.criarInstanciaFilho({
 *   origensPermitidas: ['http://localhost:3000'],
 *   onReceiveRequest: async (acao, payload) => {
 *     if (acao === 'obterPerfil') return { nome: 'Usuario', id: payload.id };
 *     throw new Error('Ação não suportada');
 *   }
 * });
 *
 * // Notificação unilateral para o pai (fire-and-forget)
 * filho.notificarPai('eventoPersonalizado', { dados: 'qualquer' });
 *
 * // Limpeza
 * filho.destroy();
 * ```
 */
import { PROTOCOLO } from "./index.js";

export class ServiceFilho {
  /**
   * @param {Object} opcoes
   * @param {Array<string>} opcoes.origensPermitidas - ex: ['http://localhost:3000', 'null']
   * @param {Function} opcoes.onReceiveRequest - async (acao, payload) => resposta
   */
  constructor({ origensPermitidas = [], onReceiveRequest } = {}) {
    if (!Array.isArray(origensPermitidas)) {
      throw new TypeError("origensPermitidas deve ser um array de strings");
    }
    if (typeof onReceiveRequest !== "function") {
      throw new TypeError("onReceiveRequest deve ser uma função assíncrona");
    }

    // normaliza origens permitidas: se for uma origem válida usa .origin, mantém 'null' literal
    this._origensPermitidas = new Set(
      origensPermitidas.map((o) => {
        if (o === "null" || o === "*") return o;
        try {
          return new URL(o).origin;
        } catch {
          // se não for URL válida, mantém como fornecida (permitir casos especiais)
          return o;
        }
      }),
    );

    this.onReceiveRequest = onReceiveRequest;
    this.porta = null;
    this._handshakeResolvido = false;

    // bound handler para podermos remover depois
    this._boundWindowMessage = this._onWindowMessage.bind(this);
    window.addEventListener("message", this._boundWindowMessage);

    // sinaliza pronto para o pai — usa document.referrer quando possível
    this._sinalizarPronto();
  }

  _isOrigemPermitida(eventOrigin) {
    // aceita 'null' (origem opaca) só se explicitamente permitida
    if (eventOrigin === "null") return this._origensPermitidas.has("null");
    if (this._origensPermitidas.has("*")) return true;
    return this._origensPermitidas.has(eventOrigin);
  }

  _sinalizarPronto() {
    // tenta derivar a origem do parent usando document.referrer (quando disponível)
    let target = "*";
    try {
      if (document.referrer) {
        const parentOrigin = new URL(document.referrer).origin;
        if (this._origensPermitidas.has(parentOrigin) || this._origensPermitidas.has("*")) {
          target = parentOrigin;
        }
      }
    } catch {
      console.warn("⚠️ [FILHO] não conseguiu derivar origem do referrer:", origem);
    }

    // envia notificação de prontidão; parent deveria responder com INIT_CHANNEL
    try {
      window.parent.postMessage({ tipo: PROTOCOLO.FILHO_PRONTO }, target);
    } catch (err) {
      try {
        window.parent.postMessage({ tipo: PROTOCOLO.FILHO_PRONTO }, "*");
      } catch (e) {
        console.warn("[FILHO] Falha ao postar FILHO_PRONTO:", e);
      }
    }
  }

  _onWindowMessage(event) {
    // valida origem
    const origem = event.origin ?? "null";
    if (!this._isOrigemPermitida(origem)) {
      console.warn("⚠️ [FILHO] Conexão recusada da origem não autorizada:", origem);
      return;
    }

    // procura INIT_CHANNEL — pode ser string simples ou objeto com tipo
    const isInit =
      event.data === PROTOCOLO.INIT_CHANNEL || event.data?.tipo === PROTOCOLO.INIT_CHANNEL;

    if (!isInit) return;

    // garante que a MessagePort exista e seja um MessagePort
    const maybePort = event.ports && event.ports[0];
    if (!maybePort || typeof maybePort.postMessage !== "function") {
      console.warn("⚠️ [FILHO] INIT_CHANNEL recebido sem MessagePort válido.");
      return;
    }

    // evita re-estabelecer se já temos um canal
    if (this.porta) {
      console.info("ℹ️ [FILHO] Canal já estabelecido — ignorando INIT_CHANNEL adicional.");
      // fechar o port recebido para não vazar recursos (opcional)
      try {
        maybePort.close?.();
      } catch { }
      return;
    }

    this._estabelecerConexao(maybePort);
  }

  _estabelecerConexao(porta) {
    this.porta = porta;

    try {
      if (typeof this.porta.start === "function") this.porta.start();
    } catch (err) {
      console.warn("[FILHO] falha ao start() na porta:", err);
    }

    this.porta.onmessage = async (canalEvent) => {
      if (!canalEvent?.data) return;
      const { nonce, acao, payload } = canalEvent.data;

      try {
        const resposta = await Promise.resolve(this.onReceiveRequest(acao, payload));
        // assegurar formato serializável
        this.porta.postMessage({ nonce, dados: resposta });
      } catch (err) {
        // garantir que temos uma mensagem de erro string
        const mensagem = err && err.message ? err.message : String(err);
        this.porta.postMessage({ nonce, erro: mensagem });
      }
    };

    this._handshakeResolvido = true;
    console.log("🔒 [FILHO] Conexão segura e privada estabelecida com o Pai.");
  }

  notificarPai(acao, dados = {}) {
    if (!this.porta) return false;
    try {
      this.porta.postMessage({ tipo: PROTOCOLO.NOTIFICACAO, acao, dados });
      return true;
    } catch (err) {
      console.warn("[FILHO] Falha ao notificar pai:", err);
      return false;
    }
  }

  destroy() {
    // remove listener global
    if (this._boundWindowMessage) {
      window.removeEventListener("message", this._boundWindowMessage);
      this._boundWindowMessage = null;
    }

    // fecha e limpa porta
    if (this.porta) {
      try {
        this.porta.onmessage = null;
      } catch { }
      try {
        this.porta.close?.();
      } catch { }
      this.porta = null;
    }
  }
}