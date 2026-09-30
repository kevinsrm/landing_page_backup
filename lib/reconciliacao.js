/**
 * lib/reconciliacao.js
 * ------------------------------------------------------------------
 * REDE DE SEGURANÇA DO CHECKOUT PIX.
 *
 * Por que isso existe:
 *   O status do Pix chega ao servidor de duas formas — o webhook do
 *   Mercado Pago e o polling que a página do checkout faz a cada 4s.
 *   As duas podem falhar justamente no momento mais importante:
 *
 *     • o cliente paga pelo app do banco e o navegador fecha / o celular
 *       descarrega a aba (Android com pouca memória) -> ninguém consulta
 *       o status e o pedido fica "pendente" para sempre;
 *     • o webhook não chega (URL não cadastrada no painel do Mercado Pago,
 *       instância do Render dormindo, instabilidade, timeout);
 *     • o pagamento é aprovado, mas o e-mail falha (link de download
 *       ainda não configurado, Mailgun fora do ar).
 *
 * Esta rotina roda DENTRO do servidor, sozinha, em intervalos regulares:
 *   1. pega os pedidos recentes que ainda estão pendentes (ou aprovados
 *      sem e-mail enviado);
 *   2. consulta cada um no Mercado Pago;
 *   3. atualiza o status no banco e dispara o e-mail com o link de
 *      download quando o pagamento aparece como aprovado.
 *
 * Ou seja: mesmo que o cliente feche tudo, o acesso é liberado assim que
 * o Pix cai. Basta o servidor estar no ar.
 *
 * Configuração (.env, tudo opcional):
 *   RECONCILIACAO=off                     desliga a rotina
 *   RECONCILIACAO_INTERVALO_MINUTOS=5     frequência da varredura
 *   RECONCILIACAO_PRIMEIRA_EXECUCAO_SEGUNDOS=20  espera do boot até a 1ª rodada
 *   RECONCILIACAO_HORAS=48                janela de pedidos considerados
 *   RECONCILIACAO_LOTE=40                 máximo de pedidos por rodada
 *   RECONCILIACAO_PAUSA_MS=250            pausa entre consultas (rate limit)
 * ------------------------------------------------------------------
 */
import {
  MP_MOCK,
  buscarPagamentosPorReferencia,
  erroDeLimiteDeTaxa,
  sincronizarPedido,
} from "./pagamentos.js";
import {
  atualizarPagamento,
  listarPedidosParaReconciliar,
  listarPedidosSemPagamento,
} from "./db.js";

function numero(nome, padrao, minimo, maximo) {
  const valor = Number(process.env[nome]);
  if (!Number.isFinite(valor)) return padrao;
  return Math.min(Math.max(valor, minimo), maximo);
}

const DESLIGADA = /^(0|false|nao|não|no|off)$/i.test(process.env.RECONCILIACAO || "");

/** Rotina ligada por padrão — é ela que garante a entrega do produto. */
export const RECONCILIACAO_ATIVA = !DESLIGADA;
export const INTERVALO_MINUTOS = numero("RECONCILIACAO_INTERVALO_MINUTOS", 5, 0.5, 24 * 60);
export const JANELA_HORAS = numero("RECONCILIACAO_HORAS", 48, 1, 24 * 30);
const PRIMEIRA_EXECUCAO_SEGUNDOS = numero("RECONCILIACAO_PRIMEIRA_EXECUCAO_SEGUNDOS", 20, 1, 3600);
const LOTE = numero("RECONCILIACAO_LOTE", 40, 1, 200);
const PAUSA_MS = numero("RECONCILIACAO_PAUSA_MS", 250, 0, 5000);
const MAX_SEM_PAGAMENTO = numero("RECONCILIACAO_MAX_SEM_PAGAMENTO", 10, 0, 50);
const TIMEOUT_MP_MS = numero("MP_TIMEOUT_MS", 30000, 1000, 120000);

/** Estado exposto em /health e no painel administrativo. */
const estado = {
  rodando: false,
  ultimaExecucao: null,
  duracaoMs: null,
  proximaExecucao: null,
  ultimoResultado: null,
};

export function statusReconciliacao() {
  return {
    ativa: RECONCILIACAO_ATIVA,
    intervaloMinutos: INTERVALO_MINUTOS,
    janelaHoras: JANELA_HORAS,
    demo: MP_MOCK,
    ...estado,
  };
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Escolhe o pagamento mais relevante quando o Mercado Pago devolve vários. */
function escolherPagamento(pagamentos = []) {
  const prioridade = { approved: 0, authorized: 1, in_process: 2, pending: 3 };
  return [...pagamentos].sort((a, b) => {
    const pa = prioridade[a?.status] ?? 4;
    const pb = prioridade[b?.status] ?? 4;
    if (pa !== pb) return pa - pb;
    return new Date(b?.date_created || 0) - new Date(a?.date_created || 0);
  })[0];
}

/** Dá timeout em uma promise (evita rodada presa em um pagamento lento). */
function comTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("tempo esgotado ao consultar o Mercado Pago")), ms);
    }),
  ]);
}

/**
 * Pedido sem payment_id: procura o pagamento pelo external_reference.
 * Devolve true quando encontrou e conseguiu sincronizar.
 */
async function reconciliarSemPagamento(pedido, resumo) {
  const pagamentos = await comTimeout(buscarPagamentosPorReferencia(pedido.id, pedido.email), TIMEOUT_MP_MS);
  if (!pagamentos.length) return false;

  const escolhido = escolherPagamento(pagamentos);
  if (!escolhido?.id) return false;

  console.log(`[reconciliação] pedido ${pedido.id} estava sem payment_id -> encontrado ${escolhido.id}`);
  await atualizarPagamento({
    pedidoId: pedido.id,
    paymentId: String(escolhido.id),
    status: escolhido.status || "pending",
  });

  // Roda a regra de negócio normal (atualiza status + envia o e-mail).
  const antes = fotografar(pedido);
  const resultado = await comTimeout(sincronizarPedido(pedido.id), TIMEOUT_MP_MS);
  registrarResultado(antes, resultado, resumo);
  return true;
}

/**
 * Guarda o estado do pedido ANTES da consulta.
 * É necessário porque o banco em memória (DB_MOCK) devolve o próprio
 * objeto, que é alterado durante a sincronização.
 */
function fotografar(pedido) {
  return {
    pedidoId: pedido.id,
    status: pedido.status_pagamento,
    emailEnviado: Number(pedido.email_enviado) === 1,
  };
}

/** Consolida o retorno de sincronizarPedido() no resumo da rodada. */
function registrarResultado(antes, resultado, resumo) {
  resumo.verificados++;

  if (resultado?.erro) {
    resumo.erros++;
    resumo.detalhes.push({ pedidoId: antes.pedidoId, status: resultado.status, erro: resultado.erro });
    return;
  }

  if (resultado?.status && resultado.status !== antes.status) {
    resumo.mudancasDeStatus.push({ pedidoId: antes.pedidoId, de: antes.status, para: resultado.status });
    if (resultado.status === "approved") resumo.aprovados++;
  }

  if (resultado?.emailEnviado && !antes.emailEnviado) {
    resumo.emailsEnviados++;
    resumo.detalhes.push({ pedidoId: antes.pedidoId, status: resultado.status, email: "enviado" });
  }
}

/**
 * Executa uma rodada completa de verificação.
 * Nunca lança erro: devolve sempre um resumo.
 *
 * @param {{motivo?: string}} opcoes
 * @returns {Promise<object>} resumo da rodada
 */
export async function reconciliarAgora({ motivo = "agendada" } = {}) {
  if (!RECONCILIACAO_ATIVA) {
    return { ok: false, motivo: "verificação automática desativada (RECONCILIACAO=off)" };
  }
  if (estado.rodando) {
    return { ok: false, motivo: "já existe uma verificação em andamento", ultimoResultado: estado.ultimoResultado };
  }

  estado.rodando = true;
  const inicio = Date.now();
  const resumo = {
    ok: true,
    motivo,
    demo: MP_MOCK,
    iniciadaEm: new Date(inicio).toISOString(),
    verificados: 0,
    aprovados: 0,
    emailsEnviados: 0,
    erros: 0,
    limiteDeTaxa: false,
    mudancasDeStatus: [],
    detalhes: [],
  };

  try {
    // 1) Pedidos em que o pagamento foi criado, mas o id não foi gravado.
    const semPagamento = await listarPedidosSemPagamento({ limite: MAX_SEM_PAGAMENTO, horas: JANELA_HORAS });
    for (const pedido of semPagamento) {
      try {
        await reconciliarSemPagamento(pedido, resumo);
      } catch (err) {
        if (erroDeLimiteDeTaxa(err)) {
          resumo.limiteDeTaxa = true;
          console.warn("[reconciliação] limite de requisições do Mercado Pago atingido — encerrando a rodada.");
          break;
        }
        resumo.erros++;
        resumo.detalhes.push({ pedidoId: pedido.id, erro: err.message });
        console.error(`[reconciliação] falha ao procurar pagamento do pedido ${pedido.id}:`, err.message);
      }
      if (PAUSA_MS) await pausa(PAUSA_MS);
    }

    // 2) Pendentes com payment_id e aprovados sem e-mail enviado.
    const pedidos = await listarPedidosParaReconciliar({ limite: LOTE, horas: JANELA_HORAS });
    for (const pedido of pedidos) {
      if (resumo.limiteDeTaxa) break;
      const antes = fotografar(pedido);
      try {
        const resultado = await comTimeout(sincronizarPedido(pedido.id), TIMEOUT_MP_MS);
        registrarResultado(antes, resultado, resumo);
      } catch (err) {
        if (erroDeLimiteDeTaxa(err)) {
          resumo.limiteDeTaxa = true;
          console.warn("[reconciliação] limite de requisições do Mercado Pago atingido — encerrando a rodada.");
          break;
        }
        resumo.erros++;
        resumo.detalhes.push({ pedidoId: pedido.id, erro: err.message });
        console.error(`[reconciliação] falha ao verificar o pedido ${pedido.id}:`, err.message);
      }
      if (PAUSA_MS) await pausa(PAUSA_MS);
    }
  } catch (err) {
    resumo.ok = false;
    resumo.erros++;
    resumo.erro = err.message;
    console.error("[reconciliação] erro inesperado:", err.message);
  } finally {
    estado.rodando = false;
    estado.ultimaExecucao = new Date().toISOString();
    estado.duracaoMs = Date.now() - inicio;
    estado.ultimoResultado = { ...resumo };
    if (estado.proximaExecucao) {
      estado.proximaExecucao = new Date(Date.now() + INTERVALO_MINUTOS * 60000).toISOString();
    }
  }

  if (resumo.aprovados || resumo.emailsEnviados || resumo.erros) {
    console.log(
      `[reconcilia\u00e7\u00e3o] ${resumo.verificados} pedido(s) verificado(s) em ${estado.duracaoMs}ms \u2014 ` +
        `${resumo.aprovados} aprovado(s), ${resumo.emailsEnviados} e-mail(s) enviado(s), ${resumo.erros} erro(s).`
    );
  }

  return resumo;
}

let timer = null;
let primeira = null;

/**
 * Liga a verificação automática dentro do processo do servidor.
 * Roda uma vez pouco depois do boot e depois a cada X minutos.
 */
export function iniciarAgendadorReconciliacao() {
  if (!RECONCILIACAO_ATIVA) {
    console.log("[reconciliação] desativada (RECONCILIACAO=off no ambiente).");
    return null;
  }
  if (MP_MOCK && process.env.NODE_ENV === "production") {
    console.error("[reconciliação] NÃO iniciada: MP_MOCK=true em produção. Remova MP_MOCK do ambiente!");
    return null;
  }
  if (timer) return timer;

  const intervaloMs = INTERVALO_MINUTOS * 60000;
  const rodar = (motivo) => {
    reconciliarAgora({ motivo }).catch((err) => console.error("[reconciliação] erro:", err.message));
  };

  estado.proximaExecucao = new Date(Date.now() + PRIMEIRA_EXECUCAO_SEGUNDOS * 1000).toISOString();
  primeira = setTimeout(() => {
    estado.proximaExecucao = new Date(Date.now() + intervaloMs).toISOString();
    rodar("inicial (boot do servidor)");
  }, PRIMEIRA_EXECUCAO_SEGUNDOS * 1000);

  timer = setInterval(() => {
    estado.proximaExecucao = new Date(Date.now() + intervaloMs).toISOString();
    rodar("agendada");
  }, intervaloMs);

  console.log(
    `[reconciliação] ativa — verificando pedidos pagos a cada ${INTERVALO_MINUTOS} min ` +
      `(primeira rodada em ${PRIMEIRA_EXECUCAO_SEGUNDOS}s, janela de ${JANELA_HORAS}h).`
  );

  return {
    parar() {
      clearTimeout(primeira);
      clearInterval(timer);
      primeira = null;
      timer = null;
      estado.proximaExecucao = null;
    },
  };
}
