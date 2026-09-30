/**
 * lib/db.js
 * ------------------------------------------------------------------
 * Camada de acesso a dados (MySQL/MariaDB via mysql2).
 *
 * Toda a aplicação fala com o banco apenas através das funções exportadas
 * aqui (repository), o que mantém o SQL em um único lugar.
 *
 * MODO DEMO: defina DB_MOCK=true no .env (ou `DB_MOCK=true npm start`)
 * para rodar o projeto sem banco de dados. Nesse caso os mesmos métodos
 * são atendidos por um banco em memória — útil para visualizar o layout,
 * testar o checkout PIX e o dashboard.
 * ------------------------------------------------------------------
 */
import mysql from "mysql2";
import dotenv from "dotenv";

dotenv.config();

export const DB_MOCK = /^(1|true|sim|yes|on)$/i.test(process.env.DB_MOCK || "");

let pool = null;

if (!DB_MOCK) {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 20,
    waitForConnections: true,
    ssl: {
      rejectUnauthorized: false,
      ca_certificate: process.env.CA_CERTIFICATE,
    },
  });
}

/** Executa uma query parametrizada e devolve as linhas. */
export async function query(sql, params = []) {
  const [rows] = await pool.promise().query(sql, params);
  return rows;
}

/* ------------------------------------------------------------------ */
/* BANCO EM MEMÓRIA (apenas quando DB_MOCK=true)                       */
/* ------------------------------------------------------------------ */

const agora = () => new Date();
const menosDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const memoria = {
  home: [
    {
      id: 1,
      nome: "Script Premium",
      descricao:
        "Script Premium X1 — Eleve sua experiência com tecnologia de ponta e design elegante. Ativação imediata, atualizações vitalícias e suporte dedicado por e-mail. Compatível com as versões mais recentes, instalação em menos de 5 minutos seguindo o guia incluso no pacote.",
      preco_sem_desconto: "297.00",
      preco_com_desconto: "97.00",
      link_download: "https://drive.google.com/file/d/1RGMlXew0zqldWRg38njBwOM8DJeDQ4rT/view",
    },
  ],
  imagens: [
    {
      id: 1,
      caminho1: "imagens-d92410b4-0be9-42f0-9bb7-7edb1970af2d1000091739.png",
      caminho2: "imagens-3111d1a2-2d07-474e-8636-2a5058efc98a1000091740.png",
      caminho3: "imagens-3a89d7c6-27cb-40f8-98c7-e5868ca882d11000091741.png",
      caminho4: "imagens-d6b84a3c-7452-41f3-ac32-1224f01bfbd11000091742.png",
    },
  ],
  usuarios: [
    {
      user_id: 1,
      email: process.env.ADMIN_EMAIL || "admin@eu.com",
      senha: process.env.ADMIN_SENHA || "resident8512",
      two_factor_secret: process.env.ADMIN_2FA || "8512",
    },
  ],
  pedidos: [
    {
      id: "216659c6-576b-4eea-aa77-d61b8b63cafb",
      payment_id: "151829845545",
      status_pagamento: "approved",
      nome: "Kevin Sthepan Ribeiro Marques",
      email: "kevinsthepan8@gmail.com",
      cpf: "063.660.653-81",
      telefone: "(98) 98551-2246",
      valor_total: 97,
      email_enviado: 1,
      data_pedido: menosDias(0),
      codigo_rastreio: null,
      email_falha: 0,
      email_pendente: 0,
    },
    {
      id: "23f45655-a5c9-4aa0-867e-4a549244ea80",
      payment_id: "153243392142",
      status_pagamento: "approved",
      nome: "Maria Vitória Souza",
      email: "maria.vitoria@gmail.com",
      cpf: "123.456.789-00",
      telefone: "(11) 98888-1111",
      valor_total: 97,
      email_enviado: 1,
      data_pedido: menosDias(1),
      codigo_rastreio: null,
      email_falha: 0,
      email_pendente: 0,
    },
    {
      id: "2d19507b-2d6f-11f1-aa85-70586907e770",
      payment_id: "10001",
      status_pagamento: "approved",
      nome: "Lucas Oliveira",
      email: "lucas.oli@email.com",
      cpf: "111.222.333-44",
      telefone: "(11) 98888-2222",
      valor_total: 97,
      email_enviado: 0,
      data_pedido: menosDias(2),
      codigo_rastreio: null,
      email_falha: 0,
      email_pendente: 0,
    },
    {
      id: "2b3226d0-901a-42d3-8578-c74176932fa4",
      payment_id: null,
      status_pagamento: "pending",
      nome: "Guilherme Oliveira",
      email: "kevinribeiro2077@gmail.com",
      cpf: "063.660.653-81",
      telefone: "(98) 97655-7746",
      valor_total: 97,
      email_enviado: 0,
      data_pedido: menosDias(1),
      codigo_rastreio: null,
      email_falha: 0,
      email_pendente: 1,
    },
    {
      id: "5331f6c1-2f7f-11f1-b3ee-af3c1fe72a1d",
      payment_id: "1234567890",
      status_pagamento: "rejected",
      nome: "João Silva",
      email: "joao.silva@email.com",
      cpf: "000.000.000-00",
      telefone: "(98) 99999-9999",
      valor_total: 97,
      email_enviado: 0,
      data_pedido: menosDias(3),
      codigo_rastreio: null,
      email_falha: 1,
      email_pendente: 0,
    },
  ],
  reembolsos: [
    {
      id: 1,
      email: "lucas.oli@email.com",
      payment_id: "10001",
      motivo: "Não consegui instalar o script na minha versão.",
      status: "pendente",
      data_pedido: menosDias(1),
    },
  ],
};

/* ------------------------------------------------------------------ */
/* HOME / CONFIGURAÇÕES                                                */
/* ------------------------------------------------------------------ */

export async function getHome() {
  if (DB_MOCK) return memoria.home[0];
  const rows = await query(
    "SELECT id, nome, descricao, preco_sem_desconto, preco_com_desconto, link_download FROM home WHERE id = 1"
  );
  return rows[0] || null;
}

export async function getImagens() {
  if (DB_MOCK) return memoria.imagens[0];
  const rows = await query("SELECT caminho1, caminho2, caminho3, caminho4 FROM imagens WHERE id = 1");
  return rows[0] || null;
}

export async function atualizarHome({ nome, precoSemDesconto, preco, descricao, linkDownload, id = 1 }) {
  if (DB_MOCK) {
    const h = memoria.home[0];
    if (nome !== undefined && nome !== null && String(nome).trim() !== "") h.nome = String(nome).trim();
    h.preco_sem_desconto = precoSemDesconto ?? h.preco_sem_desconto;
    h.preco_com_desconto = preco ?? h.preco_com_desconto;
    h.descricao = descricao ?? h.descricao;
    if (linkDownload !== undefined) h.link_download = linkDownload;
    return;
  }
  await query(
    "INSERT IGNORE INTO home (id, nome, descricao, preco_sem_desconto, preco_com_desconto) VALUES (?, 'Produto', '', '0', '0')",
    [id]
  );
  const sets = [];
  const params = [];
  if (nome !== undefined && nome !== null && String(nome).trim() !== "") {
    sets.push("nome = ?");
    params.push(String(nome).trim());
  }
  if (precoSemDesconto !== undefined) {
    sets.push("preco_sem_desconto = ?");
    params.push(precoSemDesconto);
  }
  if (preco !== undefined) {
    sets.push("preco_com_desconto = ?");
    params.push(preco);
  }
  if (descricao !== undefined) {
    sets.push("descricao = ?");
    params.push(descricao);
  }
  if (linkDownload !== undefined) {
    sets.push("link_download = ?");
    params.push(linkDownload);
  }
  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE home SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function atualizarLinkDownload(link) {
  if (DB_MOCK) {
    memoria.home[0].link_download = link;
    return;
  }
  await query("UPDATE home SET link_download = ? WHERE id = 1", [link]);
}

export async function atualizarImagens(caminhos, id = 1) {
  if (DB_MOCK) {
    const img = memoria.imagens[0];
    img.caminho1 = caminhos[0];
    img.caminho2 = caminhos[1];
    img.caminho3 = caminhos[2];
    img.caminho4 = caminhos[3];
    return;
  }
  await query("INSERT IGNORE INTO imagens (id) VALUES (?)", [id]);
  await query(
    `UPDATE imagens
        SET caminho1 = ?, caminho2 = ?, caminho3 = ?, caminho4 = ?
      WHERE id = ?`,
    [...caminhos, id]
  );
}

/* ------------------------------------------------------------------ */
/* PEDIDOS                                                             */
/* ------------------------------------------------------------------ */

export async function criarPedido(pedido) {
  if (DB_MOCK) {
    const novo = {
      id: pedido.id,
      payment_id: null,
      status_pagamento: "pending",
      nome: pedido.nome,
      email: pedido.email,
      cpf: pedido.cpf,
      telefone: pedido.telefone || null,
      valor_total: pedido.valor_total ?? null,
      email_enviado: 0,
      data_pedido: agora(),
      codigo_rastreio: null,
      email_falha: 0,
      email_pendente: 0,
    };
    memoria.pedidos.unshift(novo);
    return novo;
  }
  await query(
    `INSERT INTO pedidos
       (id, status_pagamento, nome, email, cpf, telefone, valor_total)
     VALUES (?, 'pending', ?, ?, ?, ?, ?)`,
    [pedido.id, pedido.nome, pedido.email, pedido.cpf, pedido.telefone ?? null, pedido.valor_total ?? null]
  );
  return pedido;
}

export async function getPedidoById(id) {
  if (DB_MOCK) return memoria.pedidos.find((p) => p.id === id) || null;
  const rows = await query("SELECT * FROM pedidos WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

/** Somente os dígitos de um texto (CPF, telefone...). */
function apenasDigitos(texto = "") {
  return String(texto).replace(/\D/g, "");
}

/** Normaliza limites/Janelas recebidos de variáveis de ambiente. */
function limitarNumero(valor, padrao, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(Math.max(numero, minimo), maximo);
}

/* ------------------------------------------------------------------ */
/* VERIFICAÇÃO AUTOMÁTICA (rede de segurança do Pix)                   */
/* ------------------------------------------------------------------ */

/**
 * Pedidos que a verificação automática deve consultar no Mercado Pago:
 *
 *  1. pendentes COM payment_id  -> o cliente pode ter pagado e o webhook
 *     não chegou (aba fechada, instância dormindo, queda momentânea);
 *  2. aprovados SEM e-mail      -> pagamento aprovado, mas o e-mail não
 *     saiu (link de download ausente, falha do Mailgun...).
 *
 * A janela de horas evita consultar pagamentos antigos (o Pix expira em
 * minutos, então não existe aprovação depois disso).
 */
export async function listarPedidosParaReconciliar({ limite = 40, horas = 48 } = {}) {
  const limiteSeguro = limitarNumero(limite, 40, 1, 200);
  const horasSeguras = limitarNumero(horas, 48, 1, 24 * 30);

  if (DB_MOCK) {
    const corte = Date.now() - horasSeguras * 3600000;
    return memoria.pedidos
      .filter((p) => new Date(p.data_pedido).getTime() >= corte)
      .filter(
        (p) =>
          (p.status_pagamento === "pending" && p.payment_id) ||
          (p.status_pagamento === "approved" && Number(p.email_enviado) !== 1)
      )
      .sort((a, b) => new Date(a.data_pedido) - new Date(b.data_pedido))
      .slice(0, limiteSeguro);
  }

  return query(
    `SELECT * FROM pedidos
      WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL ${horasSeguras} HOUR)
        AND (
              (status_pagamento = 'pending' AND payment_id IS NOT NULL AND payment_id <> '')
           OR (status_pagamento = 'approved' AND COALESCE(email_enviado, 0) = 0)
        )
      ORDER BY data_pedido ASC
      LIMIT ${limiteSeguro}`
  );
}

/**
 * Pedidos sem payment_id (o Mercado Pago pode ter criado o pagamento e a
 * gravação no banco falhado). Nesses casos procuramos o pagamento pelo
 * external_reference (`id#email`).
 */
export async function listarPedidosSemPagamento({ limite = 10, horas = 48 } = {}) {
  const limiteSeguro = limitarNumero(limite, 10, 1, 50);
  const horasSeguras = limitarNumero(horas, 48, 1, 24 * 30);

  if (DB_MOCK) {
    const corte = Date.now() - horasSeguras * 3600000;
    return memoria.pedidos
      .filter((p) => new Date(p.data_pedido).getTime() >= corte)
      .filter((p) => p.status_pagamento === "pending" && !p.payment_id)
      .sort((a, b) => new Date(a.data_pedido) - new Date(b.data_pedido))
      .slice(0, limiteSeguro);
  }

  return query(
    `SELECT * FROM pedidos
      WHERE status_pagamento = 'pending'
        AND (payment_id IS NULL OR payment_id = '')
        AND data_pedido >= DATE_SUB(NOW(), INTERVAL ${horasSeguras} HOUR)
      ORDER BY data_pedido ASC
      LIMIT ${limiteSeguro}`
  );
}

/** Pedidos recentes de um e-mail (usado pela página /recuperar). */
export async function listarPedidosPorEmail(email, { limite = 5, horas = 48 } = {}) {
  const emailLimpo = String(email || "").trim().toLowerCase();
  const limiteSeguro = limitarNumero(limite, 5, 1, 20);
  const horasSeguras = limitarNumero(horas, 48, 1, 24 * 30);

  if (DB_MOCK) {
    const corte = Date.now() - horasSeguras * 3600000;
    return memoria.pedidos
      .filter((p) => String(p.email).toLowerCase() === emailLimpo && new Date(p.data_pedido).getTime() >= corte)
      .sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido))
      .slice(0, limiteSeguro);
  }

  return query(
    `SELECT * FROM pedidos
      WHERE email = ?
        AND data_pedido >= DATE_SUB(NOW(), INTERVAL ${horasSeguras} HOUR)
      ORDER BY data_pedido DESC
      LIMIT ${limiteSeguro}`,
    [emailLimpo]
  );
}

/**
 * Procura pedidos APROVADOS de um cliente pelo e-mail (e CPF, quando
 * informado) — base da recuperação de acesso self-service.
 * O CPF é comparado apenas pelos dígitos, então tanto faz ele estar
 * gravado com máscara (063.660.653-81) ou sem.
 */
export async function buscarPedidosAprovados({ email, cpf = null, limite = 5 } = {}) {
  const emailLimpo = String(email || "").trim().toLowerCase();
  const cpfLimpo = cpf ? apenasDigitos(cpf) : null;
  const limiteSeguro = limitarNumero(limite, 5, 1, 20);

  if (DB_MOCK) {
    return memoria.pedidos
      .filter((p) => p.status_pagamento === "approved" && String(p.email).toLowerCase() === emailLimpo)
      .filter((p) => !cpfLimpo || apenasDigitos(p.cpf) === cpfLimpo)
      .sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido))
      .slice(0, limiteSeguro);
  }

  const filtroCpf = cpfLimpo
    ? "AND REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?"
    : "";
  return query(
    `SELECT * FROM pedidos
      WHERE status_pagamento = 'approved' AND email = ? ${filtroCpf}
      ORDER BY data_pedido DESC
      LIMIT ${limiteSeguro}`,
    cpfLimpo ? [emailLimpo, cpfLimpo] : [emailLimpo]
  );
}

export async function getPedidosPorStatus(status) {
  if (DB_MOCK) {
    return memoria.pedidos
      .filter((p) => p.status_pagamento === status)
      .sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido));
  }
  return query("SELECT * FROM pedidos WHERE status_pagamento = ? ORDER BY data_pedido DESC", [status]);
}

export async function getTotaisPorStatus() {
  if (DB_MOCK) {
    const porStatus = (s) => memoria.pedidos.filter((p) => p.status_pagamento === s);
    return {
      aprovados: porStatus("approved").length,
      pendentes: porStatus("pending").length,
      recusados: porStatus("rejected").length,
      faturamento: porStatus("approved").reduce((acc, p) => acc + Number(p.valor_total || 0), 0),
      faturamentoHoje: porStatus("approved")
        .filter((p) => new Date(p.data_pedido).toDateString() === new Date().toDateString())
        .reduce((acc, p) => acc + Number(p.valor_total || 0), 0),
    };
  }
  const rows = await query(
    `SELECT
        COALESCE(SUM(status_pagamento = 'approved'), 0) AS aprovados,
        COALESCE(SUM(status_pagamento = 'pending'), 0)  AS pendentes,
        COALESCE(SUM(status_pagamento = 'rejected'), 0) AS recusados,
        COALESCE(SUM(CASE WHEN status_pagamento = 'approved' THEN valor_total ELSE 0 END), 0) AS faturamento,
        COALESCE(SUM(CASE WHEN status_pagamento = 'approved' AND DATE(data_pedido) = CURDATE() THEN valor_total ELSE 0 END), 0) AS faturamento_hoje
     FROM pedidos`
  );
  const r = rows[0] || {};
  return {
    aprovados: Number(r.aprovados || 0),
    pendentes: Number(r.pendentes || 0),
    recusados: Number(r.recusados || 0),
    faturamento: Number(r.faturamento || 0),
    faturamentoHoje: Number(r.faturamento_hoje || 0),
  };
}

/** Últimos 7 dias de vendas aprovadas, no formato [{data: 'YYYY-MM-DD', total: n}] */
export async function getVendasUltimos7Dias() {
  if (DB_MOCK) {
    const dias = [...Array(7)].map((_, i) => menosDias(6 - i));
    return dias.map((d) => {
      const chave = d.toLocaleDateString("sv-SE");
      return {
        data: chave,
        total: memoria.pedidos.filter(
          (p) => p.status_pagamento === "approved" && new Date(p.data_pedido).toLocaleDateString("sv-SE") === chave
        ).length,
      };
    });
  }
  return query(
    `SELECT DATE_FORMAT(data_pedido, '%Y-%m-%d') AS data, COUNT(*) AS total
       FROM pedidos
      WHERE status_pagamento = 'approved'
        AND data_pedido >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
   GROUP BY DATE_FORMAT(data_pedido, '%Y-%m-%d')
   ORDER BY data ASC`
  );
}

/**
 * Atualiza o pagamento de um pedido de forma idempotente.
 * Retorna { mudou: boolean, pedido } — `mudou` é true apenas na primeira
 * transição para o novo status (usado para garantir e-mail único).
 */
export async function atualizarPagamento({ pedidoId, paymentId, status }) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return { mudou: false, pedido: null };
    const mudou = pedido.status_pagamento !== status || !pedido.payment_id;
    pedido.payment_id = paymentId ?? pedido.payment_id;
    pedido.status_pagamento = status;
    return { mudou, pedido };
  }
  const resultado = await query(
    `UPDATE pedidos
        SET payment_id = ?, status_pagamento = ?
      WHERE id = ? AND status_pagamento <> ?`,
    [paymentId, status, pedidoId, status]
  );
  const pedido = await getPedidoById(pedidoId);
  return { mudou: resultado.affectedRows > 0, pedido };
}

export async function marcarEmailEnviado(pedidoId) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (pedido) pedido.email_enviado = 1;
    return;
  }
  await query("UPDATE pedidos SET email_enviado = 1 WHERE id = ?", [pedidoId]);
}

export async function marcarEmailNaoEnviado(pedidoId) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (pedido) pedido.email_enviado = 0;
    return;
  }
  await query("UPDATE pedidos SET email_enviado = 0 WHERE id = ?", [pedidoId]);
}

/**
 * "Reserva" o envio do e-mail de forma atômica: só devolve true para a
 * primeira chamada (evita e-mail duplicado quando webhook e polling
 * chegam juntos).
 */
export async function reivindicarEnvioEmail(pedidoId) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (!pedido || Number(pedido.email_enviado) === 1) return false;
    pedido.email_enviado = 1;
    return true;
  }
  const resultado = await query(
    "UPDATE pedidos SET email_enviado = 1 WHERE id = ? AND COALESCE(email_enviado, 0) = 0",
    [pedidoId]
  );
  return resultado.affectedRows > 0;
}

export async function marcarEmailFalha(pedidoId) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (pedido) pedido.email_falha = 1;
    return;
  }
  await query("UPDATE pedidos SET email_falha = 1 WHERE id = ?", [pedidoId]);
}

export async function marcarEmailPendente(pedidoId) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (pedido) pedido.email_pendente = 1;
    return;
  }
  await query("UPDATE pedidos SET email_pendente = 1 WHERE id = ?", [pedidoId]);
}

export async function atualizarRastreio(pedidoId, codigo) {
  if (DB_MOCK) {
    const pedido = memoria.pedidos.find((p) => p.id === pedidoId);
    if (pedido) pedido.codigo_rastreio = codigo;
    return;
  }
  await query("UPDATE pedidos SET codigo_rastreio = ? WHERE id = ?", [codigo, pedidoId]);
}

/* ------------------------------------------------------------------ */
/* USUÁRIOS / ADMIN                                                    */
/* ------------------------------------------------------------------ */

export async function getAdmin() {
  if (DB_MOCK) return memoria.usuarios[0];
  const rows = await query("SELECT * FROM usuarios WHERE user_id = 1");
  return rows[0] || null;
}

/* ------------------------------------------------------------------ */
/* REEMBOLSOS                                                          */
/* ------------------------------------------------------------------ */

export async function listarReembolsos() {
  if (DB_MOCK) return [...memoria.reembolsos].reverse();
  return query("SELECT * FROM reembolsos ORDER BY id DESC");
}

export async function criarReembolso({ email, payment_id, motivo }) {
  if (DB_MOCK) {
    const novo = { id: memoria.reembolsos.length + 1, email, payment_id, motivo, status: "pendente", data_pedido: agora() };
    memoria.reembolsos.push(novo);
    return novo;
  }
  const resultado = await query(
    "INSERT INTO reembolsos (email, payment_id, motivo, status) VALUES (?, ?, ?, 'pendente')",
    [email, payment_id, motivo]
  );
  return { insertId: resultado.insertId };
}

export async function atualizarStatusReembolso(id, status) {
  if (DB_MOCK) {
    const r = memoria.reembolsos.find((x) => Number(x.id) === Number(id));
    if (r) r.status = status;
    return;
  }
  await query("UPDATE reembolsos SET status = ? WHERE id = ?", [status, id]);
}

/* ------------------------------------------------------------------ */
/* GARANTIA DE ESTRUTURA (migrações automáticas e idempotentes)        */
/* ------------------------------------------------------------------ */

/**
 * Aplica apenas as alterações que ainda faltam no banco (idempotente e
 * sem reconstruir tabelas desnecessariamente a cada boot).
 */
async function colunaExiste(tabela, coluna) {
  const rows = await query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function colunaAceitaNulo(tabela, coluna) {
  const rows = await query(
    `SELECT IS_NULLABLE AS nulo FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return String(rows[0]?.nulo || "").toUpperCase() === "YES";
}

const COLUNAS_NOVAS = [
  ["home", "link_download", "ALTER TABLE home ADD COLUMN link_download TEXT NULL"],
  ["pedidos", "email_enviado", "ALTER TABLE pedidos ADD COLUMN email_enviado TINYINT(1) NOT NULL DEFAULT 0"],
  ["pedidos", "valor_total", "ALTER TABLE pedidos ADD COLUMN valor_total DECIMAL(10,2) NULL"],
];

/** Colunas de endereço/telefone que passaram a ser opcionais (produto digital). */
const COLUNAS_OPCIONAIS = [
  ["telefone", "VARCHAR(50)"],
  ["endereco", "VARCHAR(255)"],
  ["numero", "VARCHAR(11)"],
  ["bairro", "VARCHAR(255)"],
  ["cidade", "VARCHAR(255)"],
  ["estado", "VARCHAR(255)"],
  ["cep", "VARCHAR(50)"],
];

const TABELA_REEMBOLSOS = `CREATE TABLE IF NOT EXISTS reembolsos (
     id INT AUTO_INCREMENT PRIMARY KEY,
     email VARCHAR(255) NOT NULL,
     payment_id VARCHAR(255) NOT NULL,
     motivo VARCHAR(1000) NOT NULL,
     status ENUM('pendente','aprovado','recusado') NOT NULL DEFAULT 'pendente',
     data_pedido TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export async function ensureSchema() {
  if (DB_MOCK) {
    console.log("[db] DB_MOCK=true — rodando com banco em memória (dados de demonstração).");
    return;
  }
  try {
    for (const tabela of ["home", "pedidos", "imagens", "reembolsos", "usuarios"]) {
      try {
        await query(`ALTER TABLE \`${tabela}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      } catch {}
    }

    for (const [tabela, coluna, sql] of COLUNAS_NOVAS) {
      if (!(await colunaExiste(tabela, coluna))) {
        await query(sql);
        console.log(`[db] coluna criada: ${tabela}.${coluna}`);
      }
    }

    const pendentes = [];
    for (const [coluna, tipo] of COLUNAS_OPCIONAIS) {
      if (await colunaExiste("pedidos", coluna)) {
        if (!(await colunaAceitaNulo("pedidos", coluna))) pendentes.push(`\`${coluna}\` ${tipo} NULL`);
      }
    }
    if (pendentes.length) {
      await query(`ALTER TABLE pedidos ${pendentes.map((c) => `MODIFY COLUMN ${c}`).join(", ")}`);
      console.log(`[db] colunas de endereço agora são opcionais: ${pendentes.length}`);
    }

    await query(TABELA_REEMBOLSOS);
    console.log("[db] estrutura verificada.");
  } catch (err) {
    console.warn(`[db] não foi possível verificar a estrutura automaticamente: ${err.message}`);
    console.warn("[db] rode manualmente: banco_de_dados_aqui/migracoes/001_pix_transparente_e_link_download.sql");
  }
}

/** Testa a conexão na inicialização (não derruba o servidor se falhar). */
export function testarConexao() {
  if (DB_MOCK) return Promise.resolve();
  return new Promise((resolve) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error("[db] erro ao obter conexão do pool:", err.message);
        return resolve();
      }
      console.log("[db] conexão do pool estabelecida com sucesso!");
      connection.release();
      resolve();
    });
  });
}

export { pool };
