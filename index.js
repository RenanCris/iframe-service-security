import { ServicePai } from "./IframeServicePai.js";
import { ServiceFilho } from "./IframeServiceFilho.js";

/**
 * Constantes do protocolo de comunicação interno
 * Usadas para sincronização do handshake e roteamento de mensagens
 * @readonly
 * @enum {string}
 */
export const PROTOCOLO = {
  /** Sinal enviado pelo pai para iniciar o canal seguro (MessageChannel) */
  INIT_CHANNEL: "INIT_CHANNEL",
  /** Sinal enviado pelo filho avisando que está pronto para receber o canal */
  FILHO_PRONTO: "FILHO_PRONTO",
  /** Tipo de mensagem: notificação unilateral (fire-and-forget) */
  NOTIFICACAO: "NOTIFICACAO",
};

/**
 * Opções para criar a instância do Pai (host)
 * @typedef {Object} OpcoesPai
 * @property {HTMLIFrameElement} iframeElement - Elemento <iframe> do DOM que carrega o filho
 * @property {string} urlIframeFilho - URL completa do iframe filho (ex: 'http://localhost:4000')
 * @property {Function} onNotification - Callback para notificações unilaterais do filho
 *   @param {string} onNotification.acao - Nome da ação/notificação
 *   @param {Object} onNotification.payload - Dados enviados pelo filho
 */

/**
 * Opções para criar a instância do Filho (iframe)
 * @typedef {Object} OpcoesFilho
 * @property {string[]} origensPermitidas - Lista de origens permitidas para comunicação (ex: ['http://localhost:3000'])
 * @property {Function} onReceiveRequest - Handler assíncrono para requisições do pai
 *   @param {string} onReceiveRequest.acao - Nome da ação solicitada
 *   @param {Object} onReceiveRequest.payload - Dados enviados pelo pai
 *   @returns {Promise<Object>} Resposta que será enviada de volta ao pai
 */

/**
 * Cria uma instância do comunicador do Pai (host)
 * @param {OpcoesPai} opcoes - Opções de configuração
 * @returns {ServicePai} Instância com métodos: requisitar(acao, payload), destroy()
 */
export function criarInstanciaPai(opcoes) {
  return new ServicePai(opcoes);
}

/**
 * Cria uma instância do comunicador do Filho (iframe)
 * @param {OpcoesFilho} opcoes - Opções de configuração
 * @returns {ServiceFilho} Instância com métodos: notificarPai(acao, dados), destroy()
 */
export function criarInstanciaFilho(opcoes) {
  return new ServiceFilho(opcoes);
}

export default {
  criarInstanciaPai,
  criarInstanciaFilho,
  PROTOCOLO,
};
