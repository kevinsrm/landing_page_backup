/**
 * index.js — servidor Express
 * ------------------------------------------------------------------
 * Landing page + Checkout Transparente PIX (Mercado Pago) + painel admin.
 *
 * Rotas principais:
 *   GET  /                          landing page
 *   POST /pagamento/pix             cria o pagamento PIX (QR Code + copia e cola)
 *   GET  /pagamento/status/:id      polling do status do pagamento
 *   POST /pagamento/verificar/:id   "já paguei" — consulta o MP na hora
 *   POST /webhook                   notificação do Mercado Pago
 *   GET  /recuperar                 cliente recupera o acesso sem suporte
 *   GET  /dash                      painel administrativo
 *   POST /painel/link-download      salva o link enviado no e-mail de download
 *   POST /painel/verificar-pendentes verifica agora todos os pendentes
 *   POST /tarefas/reconciliar       gatilho para cron externo (token)
 *
 * Além disso, lib/reconciliacao.js roda a cada X minutos dentro do
 * servidor verificando os pedidos que ainda não foram confirmados.
 * ------------------------------------------------------------------
 */
import express from "express";
import { engine } from "express-handlebars";
import session from "express-session";
import createMysqlStore from "express-mysql-session";
import multer from "multer";
import morgan from "morgan";
import crypto from "crypto";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { PaymentRefund } from "mercadopago";

import * as db from "./lib/db.js";
import {
  MP_MOCK,
  apenasNumeros,
  client,
  consultarPagamento,
  criarPagamentoPix,
  parsePreco,
  reenviarEmailDownload,
  sincronizarPedido,
} from "./lib/pagamentos.js";
import { icone } from "./lib/icones.js";
import {
  enviarEmailPendente,
  enviarEmailRecusado,
  enviarEmailRastreio,
  getLinkDownload,
} from "./lib/email.js";
import {
  iniciarAgendadorReconciliacao,
  reconciliarAgora,
  statusReconciliacao,
} from "./lib/reconciliacao.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const NOME_LOJA = process.env.NOME_LOJA || "kevinsrm.shop";
const SITE_URL = (process.env.SITE_URL || "https://kevinsrm.shop").replace(/\/$/, "");

// Atrás do proxy do Render: sem isso o req.ip seria sempre o do proxy,
// e os limitadores de tentativas (checkout/recuperação) ficariam globais.
app.set("trust proxy", 1);

/* ------------------------------------------------------------------ */
/* Middlewares                                                         */
/* ------------------------------------------------------------------ */

/**
 * Log das requisições HTTP (morgan): registra TODA requisição que chega,
 * com o método, a URL, o código de status da resposta e o tempo de
 * processamento. Fica antes dos demais middlewares para registrar também
 * as requisições barradas (sessão/parse) e as respostas 404.
 *
 *   production -> "combined" (padrão Apache: IP, data, método, URL,
 *                 status e user-agent — ideal para o log do Render)
 *   test       -> "tiny" (compacto, para não poluir a saída do npm test)
 *   demais     -> "dev" (uma linha colorida por requisição no terminal)
 *
 * Dá para forçar qualquer formato do morgan (ou um personalizado) com
 * LOG_FORMATO no .env, ex.:
 *   LOG_FORMATO=":method :url :status :response-time ms - :remote-addr"
 */
const formatoLog =
  process.env.LOG_FORMATO ||
  { production: "combined", test: "tiny" }[process.env.NODE_ENV] ||
  "dev";

app.use(morgan(formatoLog));

app.use(
  session({
    secret: process.env.SECRET || "troque-este-segredo",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: !db.DB_MOCK && db.pool
      ? new (createMysqlStore(session))(
          {
            createDatabaseTable: true,
            schema: {
              tableName: "sessoes",
              columnNames: {
                session_id: "session_id",
                expires: "expires",
                data: "data",
              },
            },
            expiration: 1000 * 60 * 60 * 24 * 30,
            checkExpirationInterval: 1000 * 60 * 15,
          },
          db.pool
        )
      : undefined,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias
    },
  })
);

app.use(express.static("public"));

/**
 * Healthcheck. Também serve como "keep-alive": um cron externo batendo
 * aqui a cada 10 min evita que a instância do Render (plano free) durma.
 */
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /dash\nDisallow: /login\nDisallow: /pagamento/\nDisallow: /tarefas/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (req, res) => {
  const hoje = new Date().toISOString().slice(0, 10);
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${hoje}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/suporte</loc><lastmod>${hoje}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
</urlset>`);
});

app.get("/health", (req, res) =>
  res.json({
    ok: true,
    demo: db.DB_MOCK || MP_MOCK,
    verificado_em: new Date().toISOString(),
    reconciliacao: statusReconciliacao(),
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
  res.locals.nomeLoja = NOME_LOJA;
  next();
});

/* Upload das imagens do produto (até 4). */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${crypto.randomUUID()}${file.originalname}`),
});
const upload = multer({ storage });

/* ------------------------------------------------------------------ */
/* View engine                                                         */
/* ------------------------------------------------------------------ */

app.engine(
  "handlebars",
  engine({
    partialsDir: "views/partials",
    helpers: {
      icone,
      array: (...args) => args.slice(0, -1),
      eq: (a, b) => a === b,
      ne: (a, b) => a !== b,
      not: (v) => !v,
      and: (a, b) => a && b,
      or: (a, b) => a || b,
      gt: (a, b) => Number(a) > Number(b),
      json: (v) => JSON.stringify(v ?? []),
      moeda: (v) => formatarBRL(v),
      dataHora: (v) => formatarData(v),
      dataCurta: (v) => formatarData(v, { hora: false }),
      iniciais: (nome) =>
        String(nome || "?")
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() || "")
          .join(""),
      resumo: (texto, tamanho = 140) => {
        const t = String(texto || "");
        return t.length > tamanho ? `${t.slice(0, tamanho).trimEnd()}…` : t;
      },
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", "views");

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatarBRL(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "R$ 0,00";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(valor, { hora = true } = {}) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  const dia = `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()}`;
  return hora ? `${dia} ${pad(data.getHours())}:${pad(data.getMinutes())}` : dia;
}

function emailValido(email = "") {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(email).trim());
}

/** Converte a linha do banco no objeto usado pelas views. */
function viewModelPedido(pedido) {
  return JSON.parse(
    JSON.stringify({
      ...pedido,
      valor_formatado: formatarBRL(pedido.valor_total),
      data_formatada: formatarData(pedido.data_pedido),
      email_enviado: Number(pedido.email_enviado) === 1,
    })
  );
}

function requireAdmin(req, res, next) {
  if (!req.session.usuario) return res.redirect("/login");
  return next();
}

/* ------------------------------------------------------------------ */
/* LANDING PAGE                                                        */
/* ------------------------------------------------------------------ */

app.get("/", async (req, res, next) => {
  try {
    const [home, imagens] = await Promise.all([db.getHome(), db.getImagens()]);
    const preco = parsePreco(home?.preco_com_desconto);
    const precoAntigo = parsePreco(home?.preco_sem_desconto);
    const desconto = precoAntigo && precoAntigo > preco ? Math.round(((precoAntigo - preco) / precoAntigo) * 100) : 0;

    res.render("home", {
      titulo: home?.nome || "Produto",
      produto: home || {},
      imagem: imagens || {},
      preco_formatado: formatarBRL(preco ?? 0),
      preco_antigo_formatado: precoAntigo ? formatarBRL(precoAntigo) : null,
      desconto,
      nomeLoja: NOME_LOJA,
      seo: true,
      metaDescription: "Painel SMM completo e profissional para gerenciar serviços de redes sociais. Script com entrega imediata, instalação documentada, pagamento Pix seguro e suporte especializado.",
      metaKeywords: "painel SMM, painel SMM Brasil, comprar painel SMM, script painel SMM, painel de mídia social, revenda de seguidores, serviços SMM, painel para Instagram, painel para TikTok, painel para YouTube, marketing de redes sociais, social media marketing, painel SMM profissional",
      canonicalUrl: `${SITE_URL}/`,
      ogImage: imagens?.caminho1 ? `${SITE_URL}/uploads/${imagens.caminho1}` : `${SITE_URL}/images/bgmobile.png`,
      schemaJson: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Product",
            "@id": `${SITE_URL}/#produto`,
            name: home?.nome || "Painel SMM profissional",
            description: home?.descricao || "Painel SMM completo para gerenciamento de serviços de redes sociais.",
            image: imagens?.caminho1 ? `${SITE_URL}/uploads/${imagens.caminho1}` : undefined,
            brand: { "@type": "Brand", name: NOME_LOJA },
            offers: { "@type": "Offer", url: `${SITE_URL}/`, priceCurrency: "BRL", price: Number(preco || 0).toFixed(2), availability: "https://schema.org/InStock" }
          },
          {
            "@type": "FAQPage",
            "@id": `${SITE_URL}/#faq`,
            mainEntity: [
              { "@type": "Question", name: "O que é um painel SMM?", acceptedAnswer: { "@type": "Answer", text: "Um painel SMM é uma plataforma para organizar e gerenciar serviços de marketing em redes sociais em um único ambiente." } },
              { "@type": "Question", name: "Como recebo o painel SMM?", acceptedAnswer: { "@type": "Answer", text: "Após a confirmação do pagamento via Pix, o acesso para download é enviado automaticamente ao e-mail informado na compra." } },
              { "@type": "Question", name: "O painel SMM possui suporte?", acceptedAnswer: { "@type": "Answer", text: "Sim. O pacote inclui documentação de instalação e atendimento para dúvidas." } }
            ]
          },
          { "@type": "Organization", "@id": `${SITE_URL}/#organizacao`, name: NOME_LOJA, url: SITE_URL }
        ]
      })
    });
  } catch (err) {
    console.error("[/] erro ao carregar a home:", err.message);
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* CHECKOUT TRANSPARENTE — PIX                                         */
/* ------------------------------------------------------------------ */

app.post("/pagamento/pix", async (req, res) => {
  const { nome, email, cpf, telefone } = req.body || {};

  if (!nome || !email || !cpf) {
    return res.status(400).json({ ok: false, erro: "Preencha nome, e-mail e CPF." });
  }
  if (!emailValido(email)) {
    return res.status(400).json({ ok: false, erro: "Informe um e-mail válido — é por ele que você recebe o download." });
  }
  if (apenasNumeros(cpf).length !== 11) {
    return res.status(400).json({ ok: false, erro: "CPF inválido." });
  }

  try {
    const home = await db.getHome();
    const valor = parsePreco(home?.preco_com_desconto);
    if (!valor) {
      return res.status(500).json({ ok: false, erro: "Preço do produto não configurado no painel." });
    }

    const pedidoId = randomUUID();
    await db.criarPedido({
      id: pedidoId,
      nome: String(nome).trim(),
      email: String(email).trim().toLowerCase(),
      cpf: String(cpf).trim(),
      telefone: telefone ? String(telefone).trim() : null,
      valor_total: valor,
    });

    const pagamento = await criarPagamentoPix({
      pedidoId,
      email: String(email).trim().toLowerCase(),
      nome,
      cpf,
      telefone,
      valor,
      descricao: home?.nome || "Compra no site",
    });

    await db.atualizarPagamento({ pedidoId, paymentId: pagamento.paymentId, status: "pending" });

    res.json({
      ok: true,
      pedido_id: pedidoId,
      payment_id: pagamento.paymentId,
      qr_code: pagamento.qrCode,
      qr_code_base64: pagamento.qrCodeBase64,
      valor: formatarBRL(pagamento.valor),
      expira_em: pagamento.expiraEm,
      modo_demo: MP_MOCK,
    });
  } catch (err) {
    console.error("[/pagamento/pix] erro:", err.message);
    const desenvolvimento = process.env.NODE_ENV !== "production";
    res.status(502).json({
      ok: false,
      erro: desenvolvimento && err.message
        ? err.message
        : "Não foi possível gerar o QR Code agora. Tente novamente em instantes.",
    });
  }
});

/** Polling usado pela página de checkout para saber se o PIX foi pago. */
app.get("/pagamento/status/:pedidoId", async (req, res) => {
  try {
    const resultado = await sincronizarPedido(req.params.pedidoId);
    if (resultado.erro && !resultado.status) return res.status(404).json({ ok: false, erro: resultado.erro });
    res.json({
      ok: true,
      status: resultado.status,
      aprovado: resultado.aprovado,
      email_enviado: resultado.emailEnviado,
    });
  } catch (err) {
    console.error("[/pagamento/status] erro:", err.message);
    res.status(500).json({ ok: false, erro: "erro ao verificar o pagamento" });
  }
});

/**
 * Confere a assinatura (x-signature) que o Mercado Pago envia no webhook.
 *
 * Só é exigida quando MP_WEBHOOK_SECRET está preenchido no .env (é a
 * "chave secreta" da aplicação no painel do Mercado Pago). Sem ela, a
 * verificação fica desligada — o webhook continua funcionando, mas
 * qualquer um poderia chamar a URL; como só consultamos o Mercado Pago
 * (nunca confiamos no status enviado no corpo), o risco é baixo.
 */
function assinaturaWebhookValida(req) {
  const segredo = process.env.MP_WEBHOOK_SECRET;
  if (!segredo) return true;

  const cabecalho = String(req.headers["x-signature"] || req.query.signature || "");
  const partes = Object.fromEntries(
    cabecalho
      .split(",")
      .map((item) => item.split("=").map((valor) => valor.trim()))
      .filter(([chave, valor]) => chave && valor)
  );
  if (!partes.ts || !partes.v1) return false;

  const idNotificacao = String(
    req.query["data.id"] || req.body?.data?.id || req.query.id || req.body?.id || ""
  ).toLowerCase();
  const idRequisicao = String(req.headers["x-request-id"] || "");

  // O manifesto oficial inclui o request-id; aceitamos também a variante
  // sem ele, porque algumas notificações antigas não trazem o cabeçalho.
  const manifestos = [
    `id:${idNotificacao};request-id:${idRequisicao};ts:${partes.ts};`,
    `id:${idNotificacao};ts:${partes.ts};`,
  ];

  return manifestos.some((manifesto) => {
    const esperado = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");
    const recebido = String(partes.v1).toLowerCase();
    if (esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
  });
}

/**
 * Webhook do Mercado Pago.
 * Configure em: https://www.mercadopago.com.br/developers/panel/applications
 * -> Webhooks -> Pagamentos -> https://SEU-DOMINIO/webhook
 *
 * Obs.: mesmo que o webhook falhe, a verificação automática
 * (lib/reconciliacao.js) encontra o pagamento em poucos minutos.
 */
async function tratarWebhook(req, res) {
  const origem = { ...req.query, ...(req.body || {}) };
  const tipo = origem.type || origem.topic;
  const paymentId = origem["data.id"] || origem.data?.id || origem.id;

  if (!assinaturaWebhookValida(req)) {
    console.warn("[webhook] assinatura x-signature inválida — notificação recusada.");
    return res.status(401).json({ ok: false, erro: "assinatura inválida" });
  }

  if (tipo && tipo !== "payment") return res.status(200).json({ ok: true, ignorado: tipo });
  if (!paymentId) return res.status(200).json({ ok: true, ignorado: "sem id de pagamento" });

  try {
    const pagamento = await consultarPagamento(paymentId);
    const externalReference = pagamento?.external_reference || "";
    if (!externalReference.includes("#")) {
      return res.status(200).json({ ok: true, ignorado: "external_reference inválido" });
    }
    const [pedidoId] = externalReference.split("#");
    const resultado = await sincronizarPedido(pedidoId);
    console.log(`[webhook] pagamento ${paymentId} -> status ${resultado.status}`);
    return res.status(200).json({ ok: true, status: resultado.status });
  } catch (err) {
    console.error("[webhook] erro:", err.message);
    // Responde 200 mesmo assim para o Mercado Pago não ficar reenviando.
    return res.status(200).json({ ok: false, erro: err.message });
  }
}

app.post("/webhook", tratarWebhook);
app.get("/webhook", tratarWebhook);

/* ------------------------------------------------------------------ */
/* REDE DE SEGURANÇA: consulta sob demanda + recuperação de acesso     */
/* ------------------------------------------------------------------ */

/**
 * Limitador simples em memória (por IP) para rotas públicas que disparam
 * consultas ao Mercado Pago ou envio de e-mail.
 */
const tentativas = new Map();

function limitar({ janelaMs, maximo, chave = "" }) {
  const agora = Date.now();
  // Limpeza preguiçosa para o Map não crescer sem limite.
  if (tentativas.size > 5000) {
    for (const [k, v] of tentativas) if (agora > v.expiraEm) tentativas.delete(k);
  }
  return (req, res, next) => {
    const identificador = `${chave}:${req.ip}`;
    const registro = tentativas.get(identificador);
    if (!registro || agora > registro.expiraEm) {
      tentativas.set(identificador, { total: 1, expiraEm: agora + janelaMs });
      return next();
    }
    registro.total++;
    if (registro.total > maximo) {
      const segundos = Math.ceil((registro.expiraEm - agora) / 1000);
      if (req.method === "GET") return res.redirect(`/recuperar?alerta=${encodeURIComponent(`Muitas tentativas. Tente novamente em ${segundos}s.`)}`);
      return res.status(429).json({ ok: false, erro: `Muitas tentativas. Tente novamente em ${segundos}s.` });
    }
    return next();
  };
}

const limitarVerificacao = limitar({ janelaMs: 60 * 1000, maximo: 10, chave: "verificar" });
const limitarRecuperacao = limitar({ janelaMs: 15 * 60 * 1000, maximo: 4, chave: "recuperar" });

/**
 * "Já paguei" — consulta o Mercado Pago na hora, sem esperar o webhook
 * nem a rodada automática. Usada pelo botão do checkout e pela página
 * de recuperação de acesso.
 */
app.post("/pagamento/verificar/:pedidoId", limitarVerificacao, async (req, res) => {
  try {
    const pedido = await db.getPedidoById(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ ok: false, erro: "pedido não encontrado" });

    const resultado = await sincronizarPedido(pedido.id);
    const aprovado = resultado.status === "approved";
    return res.json({
      ok: true,
      status: resultado.status,
      aprovado,
      email_enviado: resultado.emailEnviado,
      erro: resultado.erro || null,
      mensagem: aprovado
        ? resultado.emailEnviado
          ? "Pagamento confirmado! O link de download foi enviado para o seu e-mail."
          : "Pagamento confirmado, mas o e-mail ainda não pôde ser enviado. Tente novamente em instantes."
        : "Ainda não identificamos o pagamento. Se você acabou de pagar, aguarde alguns instantes e tente de novo.",
    });
  } catch (err) {
    console.error("[/pagamento/verificar] erro:", err.message);
    return res.status(500).json({ ok: false, erro: "Não foi possível verificar o pagamento agora." });
  }
});

/** Página pública de recuperação de acesso (cliente que não recebeu o e-mail). */
app.get("/recuperar", (req, res) =>
  res.render("recuperar", {
    titulo: "Recuperar meu acesso",
    nomeLoja: NOME_LOJA,
    aviso: req.query.aviso || null,
    alerta: req.query.alerta || null,
  })
);

app.post("/recuperar", limitarRecuperacao, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const cpf = String(req.body?.cpf || "").trim();

  if (!emailValido(email) || apenasNumeros(cpf).length !== 11) {
    return res.redirect(
      `/recuperar?alerta=${encodeURIComponent("Informe o e-mail usado na compra e o CPF completo do titular.")}`
    );
  }

  try {
    // Antes de dizer "não encontrei", confere no Mercado Pago os pedidos
    // recentes desse e-mail: o pagamento pode ter sido aprovado sem que o
    // webhook tivesse chegado até agora.
    const recentes = await db.listarPedidosPorEmail(email, { limite: 5, horas: 48 });
    for (const pedido of recentes) {
      if (pedido.status_pagamento === "approved" && Number(pedido.email_enviado) === 1) continue;
      try {
        await sincronizarPedido(pedido.id);
      } catch (err) {
        console.warn(`[/recuperar] não foi possível verificar o pedido ${pedido.id}:`, err.message);
      }
    }

    const aprovados = await db.buscarPedidosAprovados({ email, cpf, limite: 5 });
    if (!aprovados.length) {
      const pendentes = recentes.filter((pedido) => pedido.status_pagamento === "pending");
      return res.redirect(
        `/recuperar?alerta=${encodeURIComponent(
          pendentes.length
            ? "Encontramos um pedido seu, mas o pagamento ainda não está confirmado. Se você acabou de pagar, aguarde 1 minuto e tente novamente."
            : "Não encontramos nenhuma compra aprovada com esse e-mail e CPF. Confira os dados ou fale com o suporte."
        )}`
      );
    }

    const pedido = aprovados[0];
    const resultado = await reenviarEmailDownload(pedido.id);
    if (resultado.ok) {
      return res.redirect(
        `/recuperar?aviso=${encodeURIComponent(
          `Pronto! Enviamos o link de download para ${pedido.email}. Verifique também a caixa de spam.`
        )}`
      );
    }
    if (resultado.pulado) {
      return res.redirect(
        `/recuperar?alerta=${encodeURIComponent("O envio de e-mail está desativado no servidor. Fale com o suporte.")}`
      );
    }
    return res.redirect(
      `/recuperar?alerta=${encodeURIComponent(resultado.erro || "Não foi possível enviar o e-mail agora. Tente novamente.")}`
    );
  } catch (err) {
    console.error("[/recuperar] erro:", err.message);
    return res.redirect(`/recuperar?alerta=${encodeURIComponent("Erro interno ao tentar recuperar o acesso.")}`);
  }
});

/**
 * Gatilho externo da verificação automática (útil em hospedagens com
 * cron job, ex.: cron-job.org chamando a cada 5 min).
 * Protegido por token: CRON_SECRET (ou SECRET, se CRON_SECRET não existir).
 *   POST /tarefas/reconciliar?token=SEGREDO
 */
async function tratarTarefaReconciliacao(req, res) {
  const esperado = process.env.CRON_SECRET || process.env.SECRET;
  const enviado = req.query.token || req.body?.token || req.headers["x-cron-token"];
  if (!esperado) return res.status(503).json({ ok: false, erro: "CRON_SECRET não configurado." });
  if (String(enviado || "") !== String(esperado)) return res.status(401).json({ ok: false, erro: "token inválido" });

  const resumo = await reconciliarAgora({ motivo: "cron externo" });
  return res.json(resumo);
}

app.post("/tarefas/reconciliar", tratarTarefaReconciliacao);
app.get("/tarefas/reconciliar", tratarTarefaReconciliacao);

/* Páginas de retorno (mantidas para links antigos / e-mails). */
app.get("/success", (req, res) => res.render("success", { titulo: "Pagamento aprovado", nomeLoja: NOME_LOJA }));
app.get("/fail", (req, res) => res.render("fail", { titulo: "Pagamento não aprovado", nomeLoja: NOME_LOJA }));
app.get("/pending", (req, res) => res.render("pending", { titulo: "Pagamento pendente", nomeLoja: NOME_LOJA }));

/* ------------------------------------------------------------------ */
/* PAINEL ADMINISTRATIVO                                               */
/* ------------------------------------------------------------------ */

app.get("/dash", requireAdmin, async (req, res, next) => {
  try {
    const [
      vendas,
      aprovados,
      pendentes,
      recusados,
      totais,
      admin,
      reembolsos,
      home,
      imagens,
      linkDownload,
    ] = await Promise.all([
      db.getVendasUltimos7Dias(),
      db.getPedidosPorStatus("approved"),
      db.getPedidosPorStatus("pending"),
      db.getPedidosPorStatus("rejected"),
      db.getTotaisPorStatus(),
      db.getAdmin(),
      db.listarReembolsos(),
      db.getHome(),
      db.getImagens(),
      getLinkDownload(),
    ]);

    res.render("dashboard", {
      titulo: "Painel administrativo",
      admin: req.session.usuario?.email_u || admin?.email || "",
      nomeLoja: NOME_LOJA,
      dados: JSON.stringify(vendas),
      totais,
      pedidos: aprovados.map(viewModelPedido),
      pedidos_pendentes: pendentes.map(viewModelPedido),
      pedidos_falha: recusados.map(viewModelPedido),
      reembolsos: JSON.parse(JSON.stringify(reembolsos || [])),
      produto: home || {},
      imagemAtual: imagens || {},
      link_download: linkDownload || "",
      reconciliacao: statusReconciliacao(),
      pendentes_verificacao: pendentes.filter(
        (pedido) => pedido.payment_id || Number(pedido.email_enviado) !== 1
      ).length,
      aviso: req.query.aviso || null,
      alerta: req.query.alerta || null,
    });
  } catch (err) {
    console.error("[/dash] erro:", err);
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/* AUTENTICAÇÃO                                                        */
/* ------------------------------------------------------------------ */

app.get("/login", (req, res) => {
  if (req.session.usuario) return res.redirect("/dash");
  res.render("login", { titulo: "Entrar", nomeLoja: NOME_LOJA, erro: req.query.erro || null });
});

app.post("/loginuser", async (req, res) => {
  try {
    const { email: emailLogin, senha, doisfa } = req.body || {};
    if (!emailLogin || !senha) {
      return res.redirect("/login?erro=Preencha%20e-mail%20e%20senha.");
    }
    const admin = await db.getAdmin();
    if (!admin) return res.redirect("/login?erro=Admin%20não%20configurado%20no%20banco.");

    const credenciaisOk =
      admin.email === String(emailLogin).trim() &&
      admin.senha === senha &&
      String(admin.two_factor_secret || "") === String(doisfa || "");

    if (!credenciaisOk) {
      return res.redirect("/login?erro=Credenciais%20inválidas.");
    }

    req.session.usuario = { email_u: admin.email, logado: true };
    req.session.save((err) => {
      if (err) {
        console.error("erro ao salvar sessão:", err);
        return res.redirect("/login?erro=Erro%20ao%20iniciar%20sessão.");
      }
      return res.redirect("/dash");
    });
  } catch (err) {
    console.error("[/loginuser] erro:", err.message);
    res.status(500).send("Erro interno ao autenticar.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

/* ------------------------------------------------------------------ */
/* PAINEL — ações                                                      */
/* ------------------------------------------------------------------ */

/** Salva o link de download enviado no e-mail de pagamento aprovado. */
app.post("/painel/link-download", requireAdmin, async (req, res) => {
  const link = String(req.body?.link_download || "").trim();
  if (!link) return res.redirect("/dash?alerta=Informe%20um%20link%20de%20download.");
  if (!/^https?:\/\/.+/i.test(link)) {
    return res.redirect("/dash?alerta=O%20link%20precisa%20começar%20com%20http%20ou%20https.");
  }
  try {
    await db.atualizarLinkDownload(link);
    res.redirect("/dash?aviso=Link%20de%20download%20salvo%20com%20sucesso.");
  } catch (err) {
    console.error("[/painel/link-download] erro:", err.message);
    res.redirect("/dash?alerta=Não%20foi%20possível%20salvar%20o%20link.");
  }
});

/**
 * Verifica na hora todos os pedidos pendentes (botão do painel).
 * É o mesmo trabalho que a rotina automática faz a cada X minutos.
 */
app.post("/painel/verificar-pendentes", requireAdmin, async (req, res) => {
  try {
    const resumo = await reconciliarAgora({ motivo: "painel administrativo" });
    if (resumo.ok === false && resumo.motivo === "já existe uma verificação em andamento") {
      return res.redirect(`/dash?alerta=${encodeURIComponent("Já existe uma verificação em andamento.")}`);
    }
    const mensagem =
      `${resumo.verificados} pedido(s) verificado(s): ` +
      `${resumo.aprovados} aprovado(s), ${resumo.emailsEnviados} e-mail(s) enviado(s), ${resumo.erros} erro(s).`;
    return res.redirect(`/dash?aviso=${encodeURIComponent(mensagem)}`);
  } catch (err) {
    console.error("[/painel/verificar-pendentes] erro:", err.message);
    return res.redirect(`/dash?alerta=${encodeURIComponent("Falha ao verificar os pagamentos pendentes.")}`);
  }
});

/** Reenvia o e-mail com o link de download para um pedido aprovado. */
app.post("/painel/reenviar-download", requireAdmin, async (req, res) => {
  try {
    const resultado = await reenviarEmailDownload(req.body?.pedidoId);
    if (resultado.ok) return res.redirect("/dash?aviso=E-mail%20de%20download%20reenviado.");
    if (resultado.pulado) {
      return res.redirect("/dash?alerta=API_KEY%20do%20Mailgun%20não%20configurada%20—%20e-mail%20não%20enviado.");
    }
    return res.redirect(`/dash?alerta=${encodeURIComponent(resultado.erro || "Falha ao enviar o e-mail.")}`);
  } catch (err) {
    return res.redirect(`/dash?alerta=${encodeURIComponent(err.message)}`);
  }
});

/** Atualiza produto (preços, descrição, link de download e imagens). */
app.post(
  "/validateupload",
  requireAdmin,
  upload.array("imagens", 4),
  async (req, res) => {
    const { nome, preco_sem_desconto, preco, descricao, link_download, id = 1 } = req.body || {};
    try {
      await db.atualizarHome({
        nome: nome ?? null,
        precoSemDesconto: preco_sem_desconto ?? null,
        preco: preco ?? null,
        descricao: descricao ?? null,
        linkDownload: link_download !== undefined ? link_download : (await db.getHome())?.link_download ?? null,
        id,
      });

      if (req.files && req.files.length === 4) {
        await db.atualizarImagens(req.files.map((file) => file.filename), id);
      }

      res.redirect("/dash?aviso=Produto%20atualizado%20com%20sucesso.");
    } catch (err) {
      console.error("[/validateupload] erro:", err.message);
      res.redirect(`/dash?alerta=${encodeURIComponent(err.message)}`);
    }
  }
);

/** Envia código de rastreio (pedidos com entrega física). */
app.post("/enviar-rastreio", requireAdmin, async (req, res) => {
  const { pedidoId, codigo } = req.body || {};
  try {
    const pedido = await db.getPedidoById(pedidoId);
    if (!pedido) return res.status(404).send("Pedido não encontrado.");

    const resultado = await enviarEmailRastreio({ para: pedido.email, nome: pedido.nome, codigo });
    if (resultado.ok) await db.atualizarRastreio(pedidoId, codigo);

    res.redirect(
      resultado.ok
        ? "/dash?aviso=Código%20de%20rastreio%20enviado."
        : "/dash?alerta=Não%20foi%20possível%20enviar%20o%20e-mail%20de%20rastreio."
    );
  } catch (err) {
    console.error("[/enviar-rastreio] erro:", err.message);
    res.status(500).send("Erro interno ao enviar o rastreio.");
  }
});

/** E-mail de recuperação de venda (pagamento recusado). */
app.post("/enviar-email-rv", requireAdmin, async (req, res) => {
  try {
    const pedido = await db.getPedidoById(req.body?.pedidoId);
    if (!pedido) return res.status(404).send("Pedido não encontrado.");
    const resultado = await enviarEmailRecusado({ para: pedido.email, nome: pedido.nome, pedidoId: pedido.id });
    if (resultado.ok) await db.marcarEmailFalha(pedido.id);
    res.redirect(resultado.ok ? "/dash?aviso=E-mail%20de%20recuperação%20enviado." : "/dash?alerta=Falha%20ao%20enviar%20o%20e-mail.");
  } catch (err) {
    console.error("[/enviar-email-rv] erro:", err.message);
    res.status(500).send("Erro interno ao enviar o e-mail.");
  }
});

/** E-mail de cobrança (pagamento pendente). */
app.post("/enviar-email-rc", requireAdmin, async (req, res) => {
  try {
    const pedido = await db.getPedidoById(req.body?.pedidoId);
    if (!pedido) return res.status(404).send("Pedido não encontrado.");
    const resultado = await enviarEmailPendente({
      para: pedido.email,
      nome: pedido.nome,
      pedidoId: pedido.id,
      valor: pedido.valor_total,
    });
    if (resultado.ok) await db.marcarEmailPendente(pedido.id);
    res.redirect(resultado.ok ? "/dash?aviso=E-mail%20enviado." : "/dash?alerta=Falha%20ao%20enviar%20o%20e-mail.");
  } catch (err) {
    console.error("[/enviar-email-rc] erro:", err.message);
    res.status(500).send("Erro interno ao enviar o e-mail.");
  }
});

/* ------------------------------------------------------------------ */
/* SUPORTE / REEMBOLSOS                                                */
/* ------------------------------------------------------------------ */

app.get("/suporte", (req, res) => res.status(200).render("suport", { titulo: "Central de suporte", nomeLoja: NOME_LOJA }));
app.get("/suporte/reembolso", (req, res) =>
  res.status(200).render("reembolso", { titulo: "Solicitar reembolso", nomeLoja: NOME_LOJA })
);

app.post("/reembolsauser", async (req, res) => {
  try {
    const { email, payment_id, motivo } = req.body || {};
    if (!email || !payment_id || !motivo) {
      return res.status(400).json({ erro: "Todos os campos são obrigatórios." });
    }
    const resultado = await db.criarReembolso({ email, payment_id, motivo });
    return res.status(201).json({ message: "Solicitação de reembolso enviada.", id: resultado.insertId ?? resultado.id });
  } catch (err) {
    console.error("[/reembolsauser] erro:", err.message);
    return res.status(500).json({ erro: "Erro interno do servidor." });
  }
});

/** Estorna o pagamento no Mercado Pago (ação do admin no painel). */
app.post("/refund", requireAdmin, async (req, res) => {
  const { id: reembolsoId, payment_id: paymentId } = req.body || {};
  try {
    const reembolso = new PaymentRefund(client);
    await reembolso.create({ payment_id: paymentId });
    if (reembolsoId) await db.atualizarStatusReembolso(reembolsoId, "aprovado");
    res.redirect("/dash?aviso=Reembolso%20processado%20no%20Mercado%20Pago.");
  } catch (err) {
    console.error("[/refund] erro:", err.message);
    if (reembolsoId) {
      try {
        await db.atualizarStatusReembolso(reembolsoId, "recusado");
      } catch {}
    }
    res.redirect(`/dash?alerta=${encodeURIComponent(`Falha no reembolso: ${err.message}`)}`);
  }
});

/* ------------------------------------------------------------------ */
/* IA (suporte)                                                        */
/* ------------------------------------------------------------------ */

let genaiClient = null;

app.get("/bot", async (req, res) => {
  const pergunta = req.query.pergunta || "Explique em poucas palavras como a IA funciona";
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return res.status(503).send("GOOGLE_API_KEY não configurada.");
    }
    if (!genaiClient) {
      const { GoogleGenAI } = await import("@google/genai");
      genaiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    }
    const result = await genaiClient.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      systemInstruction:
        "Você é um assistente especializado em tecnologia. Responda de forma curta, clara e técnica.",
      contents: [{ role: "user", parts: [{ text: pergunta }] }],
    });
    const texto = result.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";
    res.send(texto);
  } catch (err) {
    console.error("[/bot] erro:", err.message);
    res.status(500).send(`Erro ao processar a IA: ${err.message}`);
  }
});

/* ------------------------------------------------------------------ */
/* 404 / erros                                                         */
/* ------------------------------------------------------------------ */

app.use((req, res) => res.status(404).render("notfound", { titulo: "Página não encontrada", nomeLoja: NOME_LOJA }));

app.use((err, req, res, next) => {
  console.error("[erro]", err.message);
  if (res.headersSent) return next(err);
  res.status(500).render("notfound", {
    titulo: "Erro interno",
    nomeLoja: NOME_LOJA,
    codigo: 500,
    mensagem:
      "Não foi possível carregar esta página. Verifique a conexão com o banco de dados e as credenciais do arquivo .env.",
  });
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function iniciar() {
  await db.testarConexao();
  await db.ensureSchema();

  // Rede de segurança: libera o acesso mesmo que o cliente feche o
  // navegador antes do webhook do Mercado Pago chegar.
  iniciarAgendadorReconciliacao();

  app.listen(port, () => {
    console.log(`servidor rodando na porta: ${port}`);
    if (db.DB_MOCK) console.log("[demo] DB_MOCK=true — usando banco em memória.");
    if (MP_MOCK) console.log("[demo] MP_MOCK=true — Mercado Pago simulado (não use em produção).");
  });
}

iniciar();

export default app;
