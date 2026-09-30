/**
 * scripts/smoke-test.js
 * ------------------------------------------------------------------
 * Teste de fumaça: sobe o servidor em modo demonstração (banco em
 * memória + Mercado Pago simulado) e exercita os fluxos principais:
 *
 *   - landing page renderiza
 *   - criação do pagamento Pix (QR Code + copia e cola)
 *   - aprovação do pagamento dispara o e-mail de download
 *   - webhook atualiza o pedido
 *   - login + painel administrativo
 *   - salvar o link de download do e-mail
 *   - 404
 *
 * Uso: npm test
 * ------------------------------------------------------------------ */
import { spawn } from "node:child_process";

const PORTA = process.env.PORT_TESTE || 3999;
const BASE = `http://127.0.0.1:${PORTA}`;

let falhas = 0;
let checagens = 0;

function verificar(descricao, condicao, extra = "") {
  checagens++;
  if (condicao) {
    console.log(`  ✔ ${descricao}`);
  } else {
    falhas++;
    console.log(`  ✘ ${descricao} ${extra}`);
  }
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function aguardarServidor(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(`${BASE}/health`);
      if (resposta.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await esperar(250);
  }
  return false;
}

const servidor = spawn(process.execPath, ["index.js"], {
  env: {
    ...process.env,
    PORT: String(PORTA),
    SECRET: "segredo-de-teste",
    DB_MOCK: "true",
    MP_MOCK: "true",
    MP_MOCK_APROVA_EM: "2",
    NODE_ENV: "test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let logs = "";
servidor.stdout.on("data", (d) => (logs += d.toString()));
servidor.stderr.on("data", (d) => (logs += d.toString()));

try {
  if (!(await aguardarServidor())) {
    console.error("O servidor não subiu.\n", logs);
    process.exit(1);
  }

  console.log("\n[1] Landing page");
  const home = await fetch(`${BASE}/`);
  const homeHtml = await home.text();
  verificar("GET / responde 200", home.status === 200, `(status ${home.status})`);
  verificar("usa o CSS do Tailwind", homeHtml.includes("/css/app.css"));
  verificar("não usa Materialize", !homeHtml.includes("materialize"));
  verificar("tem o checkout Pix", homeHtml.includes("Gerar QR Code Pix"));

  console.log("\n[2] Checkout transparente Pix");
  const respostaPix = await fetch(`${BASE}/pagamento/pix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: "Cliente Teste", email: "cliente@teste.com", cpf: "063.660.653-81" }),
  });
  const pix = await respostaPix.json();
  verificar("POST /pagamento/pix cria o pagamento", pix.ok === true, JSON.stringify(pix));
  verificar("retorna o copia e cola", typeof pix.qr_code === "string" && pix.qr_code.includes("br.gov.bcb.pix"));
  verificar("retorna o valor formatado", /R\$\s?\d/.test(pix.valor || ""), pix.valor);

  const respostaInvalida = await fetch(`${BASE}/pagamento/pix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: "X", email: "invalido", cpf: "1" }),
  });
  verificar("valida os dados do cliente", respostaInvalida.status === 400);

  console.log("\n[3] Aprovação + e-mail com o link de download");
  const antes = await (await fetch(`${BASE}/pagamento/status/${pix.pedido_id}`)).json();
  verificar("status inicial é pending", antes.status === "pending", antes.status);

  await esperar(3000);
  const webhook = await (await fetch(`${BASE}/webhook?type=payment&data.id=${pix.payment_id}`, { method: "POST" })).json();
  verificar("webhook aprova o pagamento", webhook.status === "approved", JSON.stringify(webhook));

  const depois = await (await fetch(`${BASE}/pagamento/status/${pix.pedido_id}`)).json();
  verificar("pedido fica aprovado", depois.aprovado === true);
  verificar(
    "e-mail de download foi disparado",
    logs.includes("Pagamento aprovado! Seu download está disponível") && logs.includes("cliente@teste.com")
  );

  console.log("\n[4] Painel administrativo");
  const cookie = await (async () => {
    const resposta = await fetch(`${BASE}/loginuser`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin@eu.com&senha=resident8512&doisfa=8512",
      redirect: "manual",
    });
    return resposta.headers.get("set-cookie")?.split(";")[0] || "";
  })();
  verificar("login do admin funciona", cookie.length > 0);

  const dash = await fetch(`${BASE}/dash`, { headers: { cookie }, redirect: "manual" });
  const dashHtml = await dash.text();
  verificar("GET /dash responde 200", dash.status === 200, `(status ${dash.status})`);
  verificar("mostra a visão geral", dashHtml.includes("Visão geral"));
  verificar("mostra a seção de link de download", dashHtml.includes("Link de download do e-mail"));
  verificar("lista as vendas", dashHtml.includes("Kevin Sthepan") || dashHtml.includes("Aprovadas"));

  const salvarLink = await fetch(`${BASE}/painel/link-download`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: `link_download=${encodeURIComponent("https://drive.google.com/file/d/TESTE-SMOKE/view")}`,
    redirect: "manual",
  });
  verificar(
    "salva o link de download",
    salvarLink.status === 302 && (salvarLink.headers.get("location") || "").includes("aviso="),
    salvarLink.headers.get("location") || ""
  );

  const dashComLink = await (await fetch(`${BASE}/dash`, { headers: { cookie } })).text();
  verificar("o link salvo aparece no painel", dashComLink.includes("TESTE-SMOKE"));

  console.log("\n[4b] Nome do produto editável");
  const nomeNovo = "iPhone 17 Pro Max (Teste)";
  const salvarProduto = await fetch(`${BASE}/validateupload`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({
      id: "1",
      nome: nomeNovo,
      preco_sem_desconto: "297,00",
      preco: "97,00",
      descricao: "Descrição de teste",
    }).toString(),
    redirect: "manual",
  });
  verificar(
    "salvar produto com nome retorna 302",
    salvarProduto.status === 302,
    `(status ${salvarProduto.status})`
  );

  const homeComNome = await (await fetch(`${BASE}/`)).text();
  verificar(
    "nome do produto aparece na landing page",
    homeComNome.includes(nomeNovo),
    "(não achou o nome no HTML)"
  );

  const criarComNome = await fetch(`${BASE}/pagamento/pix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: "Outro Cliente", email: "outro@teste.com", cpf: "063.660.653-81" }),
  });
  const pix2 = await criarComNome.json();
  verificar("novo pagamento Pix criado após alterar produto", pix2.ok === true);

  console.log("\n[4c] Sessão persistente (cookie volta a funcionar)");
  const dashSemCookie = await fetch(`${BASE}/dash`, { redirect: "manual" });
  verificar("sem cookie redireciona para /login", dashSemCookie.status === 302 && (dashSemCookie.headers.get("location") || "").includes("/login"));
  const dashNovamente = await fetch(`${BASE}/dash`, { headers: { cookie }, redirect: "manual" });
  verificar(
    "com o cookie da sessão de login continua acessando /dash (sessão persistente)",
    dashNovamente.status === 200,
    `(status ${dashNovamente.status})`
  );

  console.log("\n[5] Rotas de apoio");
  for (const rota of ["/login", "/suporte", "/suporte/reembolso", "/success", "/pending", "/fail"]) {
    const resposta = await fetch(`${BASE}${rota}`);
    verificar(`GET ${rota} responde 200`, resposta.status === 200, `(status ${resposta.status})`);
  }
  verificar("rota inexistente responde 404", (await fetch(`${BASE}/rota-que-nao-existe`)).status === 404);

  console.log(`\n${checagens - falhas}/${checagens} checagens passaram.`);
  if (falhas) {
    console.log("\n--- logs do servidor ---\n" + logs);
  }
} catch (erro) {
  falhas++;
  console.error("Erro inesperado no teste:", erro);
  console.log("\n--- logs do servidor ---\n" + logs);
} finally {
  servidor.kill("SIGTERM");
}

process.exit(falhas ? 1 : 0);
