/**
 * lib/pagamentos.js
 * ------------------------------------------------------------------
 * Checkout Transparente do Mercado Pago — somente PIX
 * (QR Code + código "copia e cola").
 *
 * Fluxo:
 *   1. POST /pagamento/pix  -> criarPagamentoPix() devolve qr_code (copia e cola)
 *      e qr_code_base64 (imagem) para exibir na própria página.
 *   2. O front consulta GET /pagamento/status/:pedidoId a cada 4s.
 *   3. O Mercado Pago também avisa o servidor via POST /webhook.
 *   4. Quando o status vira "approved" (uma única vez) o e-mail com o
 *      link de download é disparado automaticamente.
 *
 * MODO DEMO: MP_MOCK=true simula a API do Mercado Pago (QR Code fictício
 * aprovado após alguns segundos) para testar o fluxo sem credenciais.
 * ------------------------------------------------------------------ */
import dotenv from "dotenv";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { randomUUID } from "node:crypto";
import {
  atualizarPagamento,
  getHome,
  getPedidoById,
  marcarEmailEnviado,
  marcarEmailNaoEnviado,
  reivindicarEnvioEmail,
} from "./db.js";
import { enviarEmailDownload, getLinkDownload } from "./email.js";

dotenv.config();

export const MP_MOCK = /^(1|true|sim|yes|on)$/i.test(process.env.MP_MOCK || "");

/**
 * Timeout das chamadas ao Mercado Pago. Precisa caber dentro do tempo que a
 * hospedagem espera pela resposta (senão o proxy devolve 502 antes de nós
 * conseguirmos responder o JSON com a mensagem de erro).
 */
const TIMEOUT_MP_MS = Number(process.env.MP_TIMEOUT_MS || 12000);

/**
 * Normaliza o token colado no painel da hospedagem. Erros de colagem muito
 * comuns — aspas em volta, "ACCESS_TOKEN=" junto, espaço ou quebra de linha
 * no fim — deixam o token inválido e o Mercado Pago responde
 * "401 invalid access token".
 */
export function tokenMercadoPago() {
  let token = String(process.env.ACCESS_TOKEN || "").trim();
  token = token.replace(/^ACCESS_TOKEN\s*=\s*/i, "").trim();
  token = token.replace(/^["']|["']$/g, "").trim();
  token = token.replace(/["']$/, "").trim();
  return token;
}

const client = new MercadoPagoConfig({
  accessToken: tokenMercadoPago(),
  options: { timeout: TIMEOUT_MP_MS },
});

const payment = new Payment(client);

/** Minutos até o QR Code expirar. */
const MINUTOS_EXPIRACAO = Number(process.env.PIX_EXPIRACAO_MINUTOS || 30);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function apenasNumeros(texto = "") {
  return String(texto).replace(/\D/g, "");
}

export function normalizarValor(valor) {
  const numero = Math.round(Number(valor) * 100) / 100;
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** Converte "97,00" | "R$ 97.00" | 97 em número. */
export function parsePreco(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return normalizarValor(valor);
  let texto = String(valor).replace(/[^\d,.]/g, "");
  if (!texto) return null;
  if (texto.includes(",")) {
    // formato brasileiro: 1.234,56
    texto = texto.replace(/\./g, "").replace(",", ".");
  }
  return normalizarValor(Number(texto));
}

/** Data de expiração no formato exigido pelo MP: 2026-09-30T10:00:00.000-03:00 */
function dataExpiracao(minutos = MINUTOS_EXPIRACAO) {
  const offset = process.env.MP_TIMEZONE_OFFSET || "-03:00";
  const [, sinal = "-", hh = "03", mm = "00"] = offset.match(/^([+-])(\d{2}):(\d{2})$/) || [];
  const offsetMs = (Number(hh) * 60 + Number(mm)) * 60000 * (sinal === "-" ? -1 : 1);
  const data = new Date(Date.now() + minutos * 60000 + offsetMs);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}-${pad(data.getUTCDate())}` +
    `T${pad(data.getUTCHours())}:${pad(data.getUTCMinutes())}:${pad(data.getUTCSeconds())}.000${offset}`
  );
}

function dividirNome(nomeCompleto = "") {
  const partes = String(nomeCompleto).trim().split(/\s+/);
  return {
    firstName: partes[0] || "Cliente",
    lastName: partes.slice(1).join(" ") || partes[0] || "Cliente",
  };
}

function urlNotificacao() {
  const site = process.env.SITE_URL;
  if (!site) return undefined;
  // O Mercado Pago só aceita webhooks em HTTPS público.
  if (!/^https:\/\//i.test(site)) return undefined;
  return `${site.replace(/\/$/, "")}/webhook`;
}

/* ------------------------------------------------------------------ */
/* Mock (apenas para demonstração/testes de layout)                     */
/* ------------------------------------------------------------------ */

const pagamentosMock = new Map();
const SEGUNDOS_PARA_APROVAR_MOCK = Number(process.env.MP_MOCK_APROVA_EM || 15);

function criarPagamentoMock({ pedidoId, valor }) {
  const id = String(Math.floor(Math.random() * 9e11) + 1e11);
  const qrCode =
    `00020126580014br.gov.bcb.pix0136${randomUUID()}5204000053039865802BR5913LOJA DEMO6009SAO PAULO62070503***6304ABCD`;
  pagamentosMock.set(id, {
    id,
    pedidoId,
    status: "pending",
    valor,
    criadoEm: Date.now(),
    qrCode,
  });
  return {
    id,
    status: "pending",
    qrCode,
    qrCodeBase64: null,
    expiraEm: dataExpiracao(),
  };
}

function consultarPagamentoMock(id) {
  const registro = pagamentosMock.get(String(id));
  if (!registro) return null;
  const passouTempo = (Date.now() - registro.criadoEm) / 1000 >= SEGUNDOS_PARA_APROVAR_MOCK;
  if (passouTempo) registro.status = "approved";
  return {
    id: registro.id,
    status: registro.status,
    status_detail: registro.status === "approved" ? "accredited" : "pending_waiting_transfer",
    transaction_amount: registro.valor,
    payment_method_id: "pix",
    external_reference: `${registro.pedidoId}#mock`,
    date_created: new Date(registro.criadoEm).toISOString(),
    point_of_interaction: {
      transaction_data: { qr_code: registro.qrCode, qr_code_base64: null },
    },
  };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Cria um Error cuja mensagem pode ser mostrada ao cliente (o padrão é
 * esconder detalhes técnicos em produção).
 */
function erroExposto(mensagem, causa) {
  const erro = new Error(mensagem);
  erro.exporAoCliente = true;
  if (causa) erro.cause = causa;
  return erro;
}

/**
 * Converte o erro cru do SDK do Mercado Pago em uma mensagem útil no log
 * e no checkout. O caso mais comum é o ACCESS_TOKEN inválido/expirado.
 */
export function traduzirErroMercadoPago(err) {
  const texto = String(err?.message || err?.cause?.message || err || "");
  const status = err?.status || err?.cause?.status;

  if (/invalid access token|invalid_token|unauthorized/i.test(texto) || Number(status) === 401) {
    return erroExposto(
      "Pix indisponível: a credencial do Mercado Pago (ACCESS_TOKEN) está inválida ou expirada. " +
        "O lojista precisa atualizar essa variável no painel da hospedagem e reiniciar o serviço.",
      err
    );
  }
  if (/invalid_identification|identification/i.test(texto)) {
    return erroExposto("O CPF informado não foi aceito pelo Mercado Pago. Confira os números.", err);
  }
  if (erroDeLimiteDeTaxa(err)) {
    return erroExposto("Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.", err);
  }
  if (/payment_method|pix/i.test(texto) && /not found|disabled|unavailable/i.test(texto)) {
    return erroExposto("O PIX não está habilitado na conta do Mercado Pago. Ative a chave PIX na conta vendedora.", err);
  }
  return err;
}

/**
 * Cria um pagamento PIX (checkout transparente).
 * @returns {Promise<{paymentId:string, qrCode:string, qrCodeBase64:string|null,
 *                    valor:number, expiraEm:string}>}
 */
export async function criarPagamentoPix({ pedidoId, email, nome, cpf, valor, descricao, telefone }) {
  const valorFinal = normalizarValor(valor);
  if (!valorFinal) throw new Error("Valor do produto inválido. Ajuste o preço no painel administrativo.");

  if (MP_MOCK) {
    const mock = criarPagamentoMock({ pedidoId, valor: valorFinal });
    return { paymentId: mock.id, qrCode: mock.qrCode, qrCodeBase64: null, valor: valorFinal, expiraEm: mock.expiraEm };
  }

  const { firstName, lastName } = dividirNome(nome);
  const cpfLimpo = apenasNumeros(cpf);
  const notificationUrl = urlNotificacao();

  const body = {
    transaction_amount: valorFinal,
    description: descricao || "Compra no site",
    payment_method_id: "pix",
    date_of_expiration: dataExpiracao(),
    external_reference: `${pedidoId}#${email}`,
    metadata: { pedido_id: pedidoId, origem: "checkout_transparente_pix" },
    payer: {
      email,
      first_name: firstName,
      last_name: lastName,
      identification: cpfLimpo ? { type: "CPF", number: cpfLimpo } : undefined,
      phone: telefone ? { area_code: apenasNumeros(telefone).slice(0, 2), number: apenasNumeros(telefone).slice(2) } : undefined,
    },
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
  };

  let resposta;
  try {
    resposta = await payment.create({ body });
  } catch (err) {
    throw traduzirErroMercadoPago(err);
  }

  const dados = resposta?.point_of_interaction?.transaction_data || {};

  if (!dados.qr_code) {
    throw erroExposto(
      "O Mercado Pago não retornou o QR Code. Verifique se o PIX está habilitado na conta " +
        "e se o ACCESS_TOKEN configurado é o da aplicação correta."
    );
  }

  return {
    paymentId: String(resposta.id),
    qrCode: dados.qr_code,
    qrCodeBase64: dados.qr_code_base64 || null,
    valor: valorFinal,
    expiraEm: resposta.date_of_expiration || dataExpiracao(),
  };
}

/** Consulta um pagamento no Mercado Pago. */
export async function consultarPagamento(paymentId) {
  if (MP_MOCK) return consultarPagamentoMock(paymentId);
  return payment.get({ id: paymentId });
}

/**
 * Procura no Mercado Pago os pagamentos de um pedido pelo
 * `external_reference` (`pedidoId#email`).
 *
 * Usado quando o pedido ficou sem payment_id no banco (falha ao gravar),
 * para não perder um Pix que o cliente pagou.
 */
export async function buscarPagamentosPorReferencia(pedidoId, email) {
  if (MP_MOCK) {
    return [...pagamentosMock.values()]
      .filter((registro) => registro.pedidoId === pedidoId)
      .map((registro) => ({
        id: registro.id,
        status: registro.status,
        external_reference: `${registro.pedidoId}#mock`,
        date_created: new Date(registro.criadoEm).toISOString(),
      }));
  }

  const resposta = await payment.search({
    options: {
      external_reference: `${pedidoId}#${email}`,
      sort: "date_created",
      criteria: "desc",
      limit: 5,
      offset: 0,
    },
  });
  return Array.isArray(resposta?.results) ? resposta.results : [];
}

/** true quando o erro veio de excesso de requisições (HTTP 429). */
export function erroDeLimiteDeTaxa(err) {
  const status = err?.status || err?.cause?.status || err?.cause?.response?.status;
  if (Number(status) === 429) return true;
  return /\b429\b|too many requests|rate limit/i.test(String(err?.message || ""));
}

/**
 * Coração da regra de negócio: sincroniza o status do pagamento com o banco
 * e dispara o e-mail com o link de download na primeira aprovação.
 *
 * @returns {Promise<{status:string, aprovado:boolean, emailEnviado:boolean}>}
 */
export async function sincronizarPedido(pedidoId) {
  const pedido = await getPedidoById(pedidoId);
  if (!pedido) return { status: null, aprovado: false, emailEnviado: false, erro: "pedido não encontrado" };

  // Sem payment_id ainda (cliente abandonou antes de pagar) ou já aprovado com e-mail enviado.
  if (!pedido.payment_id) {
    return { status: pedido.status_pagamento, aprovado: false, emailEnviado: Boolean(pedido.email_enviado) };
  }
  if (pedido.status_pagamento === "approved" && Number(pedido.email_enviado) === 1) {
    return { status: "approved", aprovado: true, emailEnviado: true };
  }

  let pagamento;
  try {
    pagamento = await consultarPagamento(pedido.payment_id);
  } catch (err) {
    console.error(`[pix] erro ao consultar pagamento ${pedido.payment_id}:`, err.message);
    return { status: pedido.status_pagamento, aprovado: pedido.status_pagamento === "approved", emailEnviado: false, erro: err.message };
  }

  const status = pagamento?.status || pedido.status_pagamento;
  const { mudou } = await atualizarPagamento({
    pedidoId,
    paymentId: String(pagamento?.id ?? pedido.payment_id),
    status,
  });

  const jaEnviado = Number(pedido.email_enviado) === 1;

  if (status === "approved") {
    const link = await getLinkDownload();
    if (!link) {
      console.error("[pix] pagamento aprovado, mas nenhum link de download configurado — e-mail não enviado.");
      return { status, aprovado: true, emailEnviado: false, erro: "link de download não configurado" };
    }

    // Reserva atômica: garante um único e-mail mesmo se webhook e polling
    // chegarem ao mesmo tempo.
    const reservado = jaEnviado ? false : await reivindicarEnvioEmail(pedidoId);
    if (!reservado) return { status, aprovado: true, emailEnviado: true };

    const resultado = await enviarEmailDownload({
      para: pedido.email,
      nome: pedido.nome,
      pedidoId: pedido.id,
      valor: pagamento?.transaction_amount ?? pedido.valor_total,
      produto: await nomeDoProduto(),
    });

    if (resultado.ok || resultado.pulado) {
      if (resultado.ok) {
        console.log(`[pix] pedido ${pedidoId} aprovado -> e-mail com download enviado para ${pedido.email}`);
      } else {
        console.log(`[pix] pedido ${pedidoId} aprovado -> e-mail simulado em modo dev para ${pedido.email}`);
      }
      return { status, aprovado: true, emailEnviado: true, mudou };
    }

    // Falhou: libera o pedido para uma nova tentativa (webhook/polling/reenvio manual).
    await marcarEmailNaoEnviado(pedidoId);
    return { status, aprovado: true, emailEnviado: false, mudou, erro: resultado.erro };
  }

  return { status, aprovado: false, emailEnviado: jaEnviado, mudou };
}

/** Reenvia manualmente o e-mail com o link (ação do admin). */
export async function reenviarEmailDownload(pedidoId) {
  const pedido = await getPedidoById(pedidoId);
  if (!pedido) throw new Error("Pedido não encontrado.");
  if (pedido.status_pagamento !== "approved") throw new Error("Só é possível reenviar o download de pedidos aprovados.");

  const jaEnviado = Number(pedido.email_enviado) === 1;
  const resultado = await enviarEmailDownload({
    para: pedido.email,
    nome: pedido.nome,
    pedidoId: pedido.id,
    valor: pedido.valor_total,
    produto: await nomeDoProduto(),
  });
  if (resultado.ok) await marcarEmailEnviado(pedidoId);
  else if (!jaEnviado) await marcarEmailNaoEnviado(pedidoId);
  return resultado;
}

/** Nome do produto para o e-mail (lido da tabela home). */
async function nomeDoProduto() {
  try {
    const home = await getHome();
    return home?.nome || null;
  } catch {
    return null;
  }
}

export { payment, client };

/* ------------------------------------------------------------------ */
/* DIAGNÓSTICO                                                         */
/* ------------------------------------------------------------------ */

/**
 * Confere, sem criar nada, se as credenciais do Mercado Pago e o banco
 * continuam respondendo — e quanto tempo levam. É o que o endpoint
 * GET /diagnostico devolve.
 */
export async function diagnosticoPagamento() {
  const token = tokenMercadoPago();
  const bruto = String(process.env.ACCESS_TOKEN || "").trim();
  const mp = {
    configurado: Boolean(token),
    ms: null,
    status: null,
    ok: null,
    erro: null,
    // Impressão digital do token: ajuda a identificar token de teste,
    // aspas sobrando ou token de outra aplicação — sem expor o segredo.
    token_tipo: token ? (/^TEST-/i.test(token) ? "TESTE" : /^APP_USR-/i.test(token) ? "PRODUCAO" : "FORMATO_ESTRANHO") : "AUSENTE",
    token_tamanho: token.length,
    token_caracteres_estranhos: /["'\s]/.test(bruto) ? "sim (aspas/espaços — já normalizado pelo servidor)" : "não",
  };

  if (MP_MOCK) {
    return { mp: { ...mp, configurado: true, ok: true, motivo: "MP_MOCK=true (simulado)" }, timeout_ms: TIMEOUT_MP_MS };
  }

  if (token) {
    const inicio = Date.now();
    try {
      const resposta = await fetch("https://api.mercadopago.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MP_MS, 10000)),
      });
      mp.status = resposta.status;
      mp.ms = Date.now() - inicio;
      const corpo = await resposta.text();
      mp.ok = resposta.ok;
      if (!resposta.ok) {
        let detalhe = corpo.slice(0, 300);
        try {
          const json = JSON.parse(corpo);
          detalhe = json.message || json.error || detalhe;
        } catch {}
        mp.erro = `${resposta.status}: ${detalhe}`;
      }
    } catch (err) {
      mp.ms = Date.now() - inicio;
      mp.ok = false;
      mp.erro = err.name === "TimeoutError" ? `tempo esgotado após ${mp.ms} ms` : err.message;
    }
  } else {
    mp.erro = "ACCESS_TOKEN não definido no ambiente.";
  }

  return { mp, timeout_ms: TIMEOUT_MP_MS };
}
