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
   * @param {string[]} opcoes.origensPermitidas - Lista de origens permitidas para comunicação (ex: ['http://localhost:3000'])
   * @param {Function} opcoes.onReceiveRequest - Handler assíncrono para requisições do pai
   *   @param {string} opcoes.onReceiveRequest.acao - Nome da ação solicitada
   *   @param {Object} opcoes.onReceiveRequest.payload - Dados enviados pelo pai
   *   @returns {Promise<Object>} Resposta que será enviada de volta ao pai
   */
  constructor({ origensPermitidas, onReceiveRequest }) {
    this.origensPermitidas = origensPermitidas;
    this.onReceiveRequest = onReceiveRequest;
    this.porta = null;
    this._ouvirHandshake();
    this._sinalizarPronto();
  }

  _sinalizarPronto() {
    window.parent.postMessage({ tipo: PROTOCOLO.FILHO_PRONTO }, "*");
  }

  _ouvirHandshake() {
    window.addEventListener("message", (event) => {
      // 🔒 Validação de segurança inicial na window global
      // Permite "null" para origens opacas (quando sandbox não tem allow-same-origin)
      const origemValida =
        this.origensPermitidas.includes(event.origin) ||
        (event.origin === "null" &&
          this.origensPermitidas.some((o) => o !== "null"));

      if (!origemValida) {
        console.warn(
          "⚠️ [FILHO] Conexão recusada da origem não autorizada:",
          event.origin,
        );
        return;
      }

      if (
        (event.data === PROTOCOLO.INIT_CHANNEL ||
          event.data?.tipo === PROTOCOLO.INIT_CHANNEL) &&
        event.ports?.length > 0
      ) {
        this._estabelecerConexao(event.ports[0]);
      }
    });
  }

  _estabelecerConexao(porta) {
    this.porta = porta;

    this.porta.onmessage = async (canalEvent) => {
      if (!canalEvent.data) return;
      const { nonce, acao, payload } = canalEvent.data;

      try {
        const resposta = await this.onReceiveRequest(acao, payload);
        this.porta.postMessage({ nonce, dados: resposta });
      } catch (err) {
        this.porta.postMessage({ nonce, erro: err.message });
      }
    };

    this._handshakeResolvido = true;
    console.log("🔒 [FILHO] Conexão segura e privada estabelecida com o Pai.");
  }

  notificarPai(acao, dados = {}) {
    if (!this.porta) return false;
    this.porta.postMessage({ tipo: PROTOCOLO.NOTIFICACAO, acao, dados });
    return true;
  }

  destroy() {
    if (this.porta) this.porta.close();
  }
}
