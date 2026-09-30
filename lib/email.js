/**
 * lib/email.js
 * ------------------------------------------------------------------
 * Envio de e-mails transacionais via Mailgun + templates HTML.
 *
 * Variáveis de ambiente:
 *   API_KEY          -> chave da API do Mailgun
 *   MAILGUN_DOMAIN   -> domínio remetente (ex: contato.seusite.com.br)
 *   MAILGUN_FROM     -> remetente (ex: "Loja <no-reply@contato.seusite.com.br>")
 *   DOWNLOAD_LINK    -> link padrão de download (fallback do banco de dados)
 *
 * Sem API_KEY configurada o envio é pulado (apenas logado), o que permite
 * testar o fluxo em desenvolvimento.
 * ------------------------------------------------------------------ */
import FormData from "form-data";
import Mailgun from "mailgun.js";
import dotenv from "dotenv";
import { getHome } from "./db.js";

dotenv.config();

const DOMINIO_PADRAO = "contato.kevinsrm.shop";
const dominio = process.env.MAILGUN_DOMAIN || DOMINIO_PADRAO;
const remetente = process.env.MAILGUN_FROM || `no-reply@${dominio}`;

function escapeHtml(texto = "") {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function primeiroNome(nome = "") {
  const limpo = escapeHtml(nome).trim();
  return limpo ? limpo.split(" ")[0] : "tudo bem";
}

function formatarBRL(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Layout base compartilhado por todos os e-mails. */
function layout({ cor, titulo, conteudo, rodape }) {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b1020;font-family:'Inter','Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#0b1020;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,${cor} 0%,#1e1b4b 100%);padding:36px 32px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.75);font-weight:700;">${escapeHtml(process.env.NOME_LOJA || "kevinsrm.shop")}</p>
              <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:700;">${titulo}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              ${conteudo}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 32px;background-color:#f7f8fc;border-top:1px solid #eceef5;">
              <p style="margin:0;font-size:12px;color:#8b93a7;">${rodape || `&copy; ${new Date().getFullYear()} ${escapeHtml(process.env.NOME_LOJA || "kevinsrm.shop")} &middot; Todos os direitos reservados.`}</p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0 0;font-size:12px;color:#5b6480;">Este é um e-mail automático, por favor não responda.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function botao({ href, texto, cor = "#4f46e5" }) {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:26px 0 6px 0;">
  <tr><td align="center">
    <a href="${href}" target="_blank" rel="noopener"
       style="display:inline-block;padding:16px 40px;background-color:${cor};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;letter-spacing:0.3px;">${texto}</a>
  </td></tr>
</table>`;
}

function paragrafo(texto) {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.7;color:#4a5163;">${texto}</p>`;
}

function caixaDetalhe({ titulo, valor }) {
  return `<tr>
  <td style="padding:10px 0;font-size:13px;color:#8b93a7;text-transform:uppercase;letter-spacing:1px;font-weight:600;">${titulo}</td>
  <td align="right" style="padding:10px 0;font-size:14px;color:#1f2540;font-weight:600;">${valor}</td>
</tr>`;
}

/* ------------------------------------------------------------------ */
/* Link de download                                                    */
/* ------------------------------------------------------------------ */

/**
 * Link que será enviado no e-mail.
 * Prioridade: banco de dados (home.link_download) -> variável DOWNLOAD_LINK.
 */
export async function getLinkDownload() {
  try {
    const home = await getHome();
    if (home && home.link_download && String(home.link_download).trim()) {
      return String(home.link_download).trim();
    }
  } catch (err) {
    console.warn("[email] não foi possível ler o link de download do banco:", err.message);
  }
  return process.env.DOWNLOAD_LINK || null;
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * E-mail enviado quando o pagamento é APROVADO.
 * Contém o botão de download do script.
 */
export function templateDownload({ nome, pedidoId, link, valor, produto }) {
  const valorFormatado = formatarBRL(valor);
  const conteudo = `
    ${paragrafo(`Olá, <strong>${primeiroNome(nome)}</strong>!`)}
    ${paragrafo(
      "Boas notícias: <strong>seu pagamento foi aprovado</strong> e o seu acesso já está liberado. " +
        "Use o botão abaixo para baixar o seu script — o guia de instalação completo está dentro do pacote."
    )}
    ${botao({ href: link, texto: "BAIXAR MEU SCRIPT", cor: "#4f46e5" })}
    <p style="margin:0 0 22px 0;text-align:center;font-size:13px;color:#8b93a7;">
      Se o botão não funcionar, copie o link:<br>
      <span style="word-break:break-all;color:#4f46e5;">${escapeHtml(link)}</span>
    </p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f7f8fc;border:1px solid #eceef5;border-radius:14px;padding:6px 18px;">
      ${caixaDetalhe({ titulo: "Pedido", valor: escapeHtml(String(pedidoId).slice(0, 13)) })}
      ${produto ? caixaDetalhe({ titulo: "Produto", valor: escapeHtml(produto) }) : ""}
      ${valorFormatado ? caixaDetalhe({ titulo: "Valor pago", valor: valorFormatado }) : ""}
      ${caixaDetalhe({ titulo: "Pagamento", valor: "PIX &middot; aprovado" })}
    </table>
    ${paragrafo(
      '<span style="font-size:13px;color:#8b93a7;">Guarde este e-mail: o link de download fica disponível nele. Qualquer dúvida, basta responder esta mensagem.</span>'
    )}`;

  return layout({ cor: "#059669", titulo: "Pagamento aprovado! Seu download está pronto 🎉", conteudo });
}

/** E-mail de cobrança amigável para pagamentos pendentes. */
export function templatePagamentoPendente({ nome, valor }) {
  const valorFormatado = formatarBRL(valor);
  const conteudo = `
    ${paragrafo(`Olá, <strong>${primeiroNome(nome)}</strong>!`)}
    ${paragrafo(
      "Notamos que o seu pagamento via <strong>PIX</strong> ainda não foi concluído. " +
        "Seu pedido continua reservado — para liberar o acesso basta finalizar o pagamento."
    )}
    ${paragrafo(
      "Lembre-se: o código <strong>Pix copia e cola</strong> tem validade limitada. " +
        "Se ele expirou, é só gerar um novo na página do produto."
    )}
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#fffbeb;border-left:4px solid #f59e0b;border-radius:10px;padding:16px 18px;">
      <tr><td style="font-size:14px;line-height:1.6;color:#92400e;">
        <strong>${valorFormatado ? `Valor: ${valorFormatado}` : "Confira o valor na página do produto"}</strong><br>
        A aprovação do PIX costuma ser instantânea após o pagamento.
      </td></tr>
    </table>`;

  return layout({ cor: "#b45309", titulo: "Falta pouco para liberar seu acesso ⏳", conteudo });
}

/** E-mail de recuperação para pagamentos recusados. */
export function templatePagamentoRecusado({ nome }) {
  const conteudo = `
    ${paragrafo(`Olá, <strong>${primeiroNome(nome)}</strong>!`)}
    ${paragrafo(
      "Não conseguimos confirmar o seu pagamento desta vez, mas não se preocupe: " +
        "seu pedido ainda está reservado e você pode tentar novamente quando quiser."
    )}
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
           style="background-color:#f7f8fc;border-left:4px solid #4f46e5;border-radius:10px;padding:16px 18px;">
      <tr><td style="font-size:14px;line-height:1.6;color:#4a5163;">
        <strong>Como resolver rápido:</strong><br>
        &bull; Confira se o saldo/limite da conta utilizada é suficiente;<br>
        &bull; Gere um novo QR Code na página do produto (códigos PIX expiram);<br>
        &bull; Pague com a mesma conta/CPF informado na compra.
      </td></tr>
    </table>
    ${paragrafo('<span style="font-size:13px;color:#8b93a7;">Se você já pagou, desconsidere este e-mail — a liberação é automática.</span>')}`;

  return layout({ cor: "#be123c", titulo: "Não foi possível concluir seu pagamento", conteudo });
}

/** E-mail com código de rastreio (mantido para pedidos com entrega física). */
export function templateRastreio({ nome, codigo }) {
  const conteudo = `
    ${paragrafo(`Olá, <strong>${primeiroNome(nome)}</strong>!`)}
    ${paragrafo("Seu pedido foi despachado e já está a caminho. Acompanhe a entrega com o código abaixo:")}
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 4px 0;">
      <tr><td align="center" style="background-color:#f7f8fc;border:1px dashed #4f46e5;border-radius:12px;padding:18px;">
        <span style="font-size:20px;letter-spacing:2px;font-weight:700;color:#4f46e5;">${escapeHtml(codigo)}</span>
      </td></tr>
    </table>
    ${botao({
      href: `https://www.linkderastreio.com.br/?codigo=${encodeURIComponent(codigo)}`,
      texto: "RASTREAR MINHA ENTREGA",
      cor: "#059669",
    })}`;

  return layout({ cor: "#0284c7", titulo: "Seu pedido foi enviado 📦", conteudo });
}

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

let clienteMailgun = null;

function getCliente() {
  if (process.env.NODE_ENV === "test") return null;
  if (!process.env.API_KEY || process.env.API_KEY.includes("xxxx") || process.env.API_KEY.startsWith("key-")) return null;
  if (!clienteMailgun) {
    const mailgun = new Mailgun(FormData);
    clienteMailgun = mailgun.client({
      username: "api",
      key: process.env.API_KEY,
      url: process.env.MAILGUN_URL || undefined, // ex: https://api.eu.mailgun.net
    });
  }
  return clienteMailgun;
}

/** Envia um e-mail. Nunca lança erro: devolve { ok, pulado, erro }. */
export async function enviarEmail({ to, subject, text, html }) {
  const cliente = getCliente();
  if (!cliente) {
    console.warn(`[email] API_KEY ausente — e-mail "${subject}" para ${to} não foi enviado (modo desenvolvimento).`);
    return { ok: false, pulado: true };
  }
  try {
    const resposta = await cliente.messages.create(dominio, {
      from: remetente,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: text || subject,
      html,
    });
    console.log(`[email] enviado para ${to} — id: ${resposta?.id || "n/d"}`);
    return { ok: true, resposta };
  } catch (err) {
    console.error(`[email] falha ao enviar para ${to}:`, err.message);
    return { ok: false, erro: err.message };
  }
}

/* ------------------------------------------------------------------ */
/* Atalhos de alto nível                                               */
/* ------------------------------------------------------------------ */

/** E-mail com o link de download — disparado quando o pagamento é aprovado. */
export async function enviarEmailDownload({ para, nome, pedidoId, valor, produto }) {
  const link = await getLinkDownload();
  if (!link) {
    console.error(
      "[email] link de download não configurado (home.link_download ou DOWNLOAD_LINK). E-mail não enviado."
    );
    return { ok: false, erro: "link de download não configurado" };
  }
  return enviarEmail({
    to: para,
    subject: "Pagamento aprovado! Seu download está disponível",
    text: `Seu pagamento foi aprovado. Baixe o seu script aqui: ${link}`,
    html: templateDownload({ nome, pedidoId, link, valor, produto }),
  });
}

export async function enviarEmailPendente({ para, nome, pedidoId, valor }) {
  return enviarEmail({
    to: para,
    subject: "Falta pouco para liberar seu acesso",
    text: `Seu pedido ${pedidoId} está com pagamento pendente. Finalize o PIX para receber o acesso.`,
    html: templatePagamentoPendente({ nome, valor }),
  });
}

export async function enviarEmailRecusado({ para, nome, pedidoId }) {
  return enviarEmail({
    to: para,
    subject: "Não foi possível concluir seu pagamento",
    text: `Não conseguimos confirmar o pagamento do pedido ${pedidoId}. Você pode tentar novamente.`,
    html: templatePagamentoRecusado({ nome }),
  });
}

export async function enviarEmailRastreio({ para, nome, codigo }) {
  return enviarEmail({
    to: para,
    subject: "Seu pedido foi enviado 📦",
    text: `Seu pedido foi enviado. Código de rastreio: ${codigo}`,
    html: templateRastreio({ nome, codigo }),
  });
}

export { escapeHtml };
