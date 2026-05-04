import express from "express";
import {engine} from "express-handlebars";
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import crypto from "crypto";
import multer from "multer";
import fs from "fs";
import session from "express-session";
dotenv.config();
import path from 'path';
const app = express();


app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // true só com HTTPS
    maxAge: 1000 * 60 * 60 // 1h
  }
}));


const port = process.env.PORT || 3000;
const access_token = process.env.ACCESS_TOKEN;

//preciso tornar o nome das imagens em uma variavel global pra usar na rota validate upload e salvar no banco de dados
/*
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads')
  },
  filename: function (req, file, cb) {
    const uniqueid = crypto.randomUUID();
    cb(null, file.fieldname + '-' + uniqueid + file.originalname)
  }
})
const upload = multer({ storage: storage });
*/
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads');
  },
  filename: function (req, file, cb) {
    const uniqueid = crypto.randomUUID();
    const nomeArquivo = file.fieldname + '-' + uniqueid + file.originalname;

    // salva no req (seguro por requisição)
    if (!req.nomesImagens) {
      req.nomesImagens = [];
    }

    req.nomesImagens.push(nomeArquivo);

    cb(null, nomeArquivo);
  }
});

const upload = multer({ storage: storage });

// database.js
import mysql from 'mysql2';
app.use(express.static('public'));
app.get("/testando", (req, res)=>{
    res.send("funcionando");
})
// Configure and create the pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 50,
  ssl:{
  rejectUnauthorized: false,
  ca_certificate: process.env.CA_CERTIFICATE
  } // Adjust based on needs
});

import nodemailer from "nodemailer";

// criando transportador usando SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // use STARTTLS (upgrade connection to TLS after connecting)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.get("/verificarconexaosmtp", async (req, res)=>{
   try {
  await transporter.verify();
  res.status(200).send("conexão bem sucedida: <a href='/sendmessage'>enviar mensagem de teste</a> ");
} catch (err) {
  console.error("Verification failed:", err);
  res.status(500).send("erro de conexão: ",err.message());
}
})

//enviar email de teste
app.get("/sendmessage", async (req, res)=>{
   try {
  const info = await transporter.sendMail({
    from: process.env.SMTP_USER, // sender address
    to: "kevinribeiro2077@gmail.com", // list of recipients
    subject: "esta é um email de teste", // subject line
    text: "Hello world?", // plain text body
    html: "<h1>Hello world?</h1><p>esta é uma mensagem de teste</p>", // HTML body
  });
  if (info.rejected.length < 1) {
    res.status(200).send("email enviado, id: " + info.messageId);
  }
} catch (err) {
  res.status(500).send("erro enviando mensagem: " + err.message);
}
})

// Exemplo com Pool
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Erro ao obter conexão do pool:', err.message);
    return;
  }
  console.log('Conexão do pool estabelecida com sucesso!');
  
  // Importante: Libere a conexão de volta ao pool após o teste
  connection.release();
});



// Step 1: Importe partes dos modulos que quer usar
import { MercadoPagoConfig, Preference } from "mercadopago";
import { Payment } from "mercadopago";
app.use(express.urlencoded({extended: true}));
app.use(express.json());
// Step 2: Inicializa o objeto client
const client = new MercadoPagoConfig({
//esse é o access token de credenciais de produção
	accessToken: access_token,
	options: { timeout: 30000 },
});

app.post("/create-preference", async (req,res)=>{
const preference = new Preference(client);
const dados = req.body;
const meuPedidoId = randomUUID();
const emailUser = dados.email;
if (!dados.nome || !dados.email || !dados.cpf) {
  return res.status(400).send("Dados inválidos");
}

await pool.promise().query(
  `INSERT INTO pedidos 
  (id, status_pagamento, nome, email, cpf, telefone, endereco, numero, bairro, complemento, cidade, estado, cep)
  VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    meuPedidoId,
    dados.nome,
    dados.email,
    dados.cpf,
    dados.telefone,
    dados.endereco,
    dados.numero,
    dados.bairro,
    dados.complemento,
    dados.cidade,
    dados.estado,
    dados.cep
  ]
);

preference.create({
  body: {
    items: [
      {
        title: 'Meu produto',
        quantity: 1,
        //esse é o frete que vem de uma tabela do banco
        unit_price: 100
      }
    ],
     external_reference: `${meuPedidoId}#${emailUser}`,
     payment_methods: {
        excluded_payment_types: [],
        excluded_payment_methods: [],
        installments: 12
    },
      shipments: {
  mode: 'not_specified',
  cost: Number(process.env.FRETE), // Custo fixo que você definiu
},
   back_urls: {
                success: `${process.env.SITE_URL}/success`, // Altere para sua URL >
                failure: `${process.env.SITE_URL}/fail`,
                pending: `${process.env.SITE_URL}/pending`
            },
	     auto_return: "approved",
  }
})
.then((data) => {
console.log(data)
return res.redirect(data.init_point);
/*
res.status(200).json({
preference_id: data.id,
preference_url: data.init_point
})
*/
})
.catch((error)=>{
res.status(500).json({"error": "erro ao criar preference"})
});
})


app.engine('handlebars', engine({
    helpers: {
        // Compara se são iguais
        eq: (v1, v2) => v1 === v2,
        
        // Inverte o valor booleano (resolve o erro "missing helper not")
        not: (v) => !v,
        
        // Verifica se as duas condições são verdadeiras
        and: (v1, v2) => v1 && v2,
        
        // Exemplo extra: Diferente de
        ne: (v1, v2) => v1 !== v2
    }
}));

app.set('view engine', 'handlebars');
app.set('views', 'views') ;

app.get("/", async (req,res)=>{
try{
    let sql = "SELECT caminho1, caminho2, caminho3, caminho4 FROM imagens WHERE id = 1";
    //aqui
    const dados_sql1 = "SELECT preco_sem_desconto, preco_com_desconto, descricao FROM home WHERE id = 1";
      let [resultadoHome1] = await pool.promise().query(dados_sql1);
    
    let [rows] = await pool.promise().query(sql)
res.render("home", {imagem: rows[0], resultado_home: resultadoHome1[0]});
}
catch(err){
    console.log("ocorreu um erro na rota / : " + err.message);
}
})

app.get("/success", async (req, res)=>{
try{
const payment = new Payment(client);
  const paymentId = req.query.payment_id;
  if (!paymentId) {
  return res.render("pending");
}
  const data = await payment.get({ id: paymentId });
  if (!data || !data.id) {
  return res.render("fail");
}
if (!data.external_reference || !data.external_reference.includes("#")) {
  return res.render("fail");
}

const [pedidoId, emailUsuario] = data.external_reference.split("#");
  
  
  const status = data.status;
  if (!pedidoId) {
  return res.render("fail");
}
await pool.promise().query(
  `UPDATE pedidos
   SET payment_id = ?, status_pagamento = ?
   WHERE id = ?`,
  [paymentId, status, pedidoId]
);
  console.log("informações do payment_id: \n" + data);
  if (status === "approved") {
    //enviar um email pro usuario confirmando pagamento
   try {
  const info = await transporter.sendMail({
    from: process.env.SMTP_USER, // sender address
    to: emailUsuario, // list of recipients
    subject: `Seu pagamento foi aprovado`, // subject line
    text: "Seu pagamento já foi aprovado", // plain text body
    html: `
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Pagamento Confirmado</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f9fc; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f6f9fc; padding: 20px 0;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    <tr>
                        <td align="center" style="background-color: #27ae60; padding: 40px 20px;">
                            <div style="font-size: 50px; color: #ffffff; margin-bottom: 10px;">✔</div>
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Pagamento Confirmado</h1>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                                Olá, tudo bem?
                            </p>
                            <p style="font-size: 16px; color: #4a4a4a; line-height: 1.6; margin: 0 0 20px 0;">
                                Boas notícias! Recebemos a confirmação do seu pagamento e seu pedido já está em nossa fila de processamento.
                            </p>
                            
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f7ff; border-left: 4px solid #3498db; border-radius: 4px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <strong style="color: #2c3e50; font-size: 15px; display: block; margin-bottom: 5px;">Próximos passos:</strong>
                                        <p style="font-size: 14px; color: #5a6c7d; margin: 0;">
                                            Assim que o envio for realizado, você receberá um novo e-mail contendo o seu <strong>código de rastreio</strong> e o link para acompanhar a entrega.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="font-size: 14px; color: #9b9b9b; margin-top: 30px; text-align: center;">
                                Se tiver qualquer dúvida, basta responder a este e-mail.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 20px; background-color: #fafafa; border-top: 1px solid #eeeeee;">
                            <p style="font-size: 12px; color: #bdc3c7; margin: 0;">
                                &copy; 2026 Sua Loja Digital. Todos os direitos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`, // HTML body
  });
} catch (err) {
  res.status(500).send("Error while sending mail: " + err.message);
}
  return res.render("success");
} else if (status === "pending") {
  //enviar um email pro usuario com instruções para realizar o pagamento
  return res.render("pending");
} else {
  //enviar um email para o usuario tentando recuperar a venda.
  return res.render("fail");
}
}
catch(err){
console.log(`ocorreu um erro: ${err}`);
return res.render("fail");
}
})

app.get("/fail", (req, res)=>{
res.render("fail")
})

app.get("/pending", (req, res)=>{
res.render("pending")
})


app.post("/checkout",(req,res)=>{
res.redirect("/")
})

app.get("/dash", async (req, res) => {
    
    if (!req.session.usuario) {
    return res.redirect("/login");
  }
  
    // Query correta usando DATE_FORMAT para evitar problemas de fuso horário no JS
    const query = "SELECT DATE_FORMAT(data_pedido, '%Y-%m-%d') AS data, COUNT(*) AS total FROM pedidos WHERE status_pagamento = 'approved' AND data_pedido >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(data_pedido) ORDER BY data_pedido ASC;";
    
    const query2 = "SELECT * FROM pedidos WHERE status_pagamento = 'approved'";
    const query3 = "SELECT * FROM pedidos WHERE status_pagamento = 'rejected'";
    const query4 = "SELECT * FROM pedidos WHERE status_pagamento = 'pending'";
    const queryUser = "SELECT * FROM usuarios WHERE user_id = 1";
    try {
        // MUDANÇA AQUI: de 'db.query' para 'pool.promise().query'
        const [rows] = await pool.promise().query(query); 
        const [rows2] = await pool.promise().query(query2);
        const [rows3] = await pool.promise().query(query3);
        const [rows4] = await pool.promise().query(query4);
        const [rows5] = await pool.promise().query(queryUser);
        
        const pedidosLimpos = JSON.parse(JSON.stringify(rows2));
        
        // Enviamos o JSON direto para o Handlebars
       // dados: rows5[0], admin: req.session.usuario.email_usuario
        res.render("dashboard", { dados: JSON.stringify(rows), pedidos: pedidosLimpos, pedidos_falha: rows3, pedidos_pendentes: rows4, dadosUser: rows5[0], admin: req.session.usuario.email_u}); 
      
    } catch (err) {
        console.error(err);
        //res.status(500).send("Erro ao carregar o dashboard");
    }
});

//envia codigo de rastreio
app.post("/enviar-rastreio", async (req, res) => {
    // Certifique-se que o nome do campo no formulário HTML é 'codigo' ou 'codigo_rastreio'
    const { pedidoId, codigo } = req.body; 

    try {
        // 1. Busca os dados do cliente
        const [rows] = await pool.promise().query(
            "SELECT nome, email FROM pedidos WHERE id = ?", 
            [pedidoId]
        );

        if (rows.length > 0) {
            const cliente = rows[0];

            // 2. Configura o envio do e-mail com HTML
            const mailOptions = {
                from: process.env.SMTP_USER,
                to: cliente.email,
                subject: `Boa notícia, ${cliente.nome.split(' ')[0]}! Seu pedido foi enviado 📦`,
                html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #2196F3; color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0;">Pedido Enviado!</h1>
                    </div>
                    <div style="padding: 20px; color: #333; line-height: 1.6;">
                        <p>Olá, <strong>${cliente.nome}</strong>,</p>
                        <p>Seu pedido acaba de ser despachado e já está a caminho! Você pode acompanhar a entrega usando o código de rastreio abaixo:</p>
                        
                        <div style="background-color: #f9f9f9; border: 1px dashed #2196F3; padding: 15px; text-align: center; margin: 20px 0; border-radius: 4px;">
                            <span style="font-size: 1.2rem; letter-spacing: 2px; font-weight: bold; color: #2196F3;">
                                ${codigo}
                            </span>
                        </div>

                        <p style="text-align: center;">
                            <a href="https://www.linkderastreio.com.br/?codigo=${codigo}" 
                               style="background-color: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                               Rastrear minha encomenda
                            </a>
                        </p>

                        <p style="font-size: 0.9rem; color: #777; margin-top: 30px;">
                            Se tiver qualquer dúvida, basta responder a este e-mail.<br>
                            Atenciosamente, <strong>Equipe Sua Loja</strong>
                        </p>
                    </div>
                </div>
                `
            };

            // Envia o e-mail
            await transporter.sendMail(mailOptions);

            // 3. ATUALIZA O BANCO (Isso desabilita o botão no dashboard)
            await pool.promise().query(
                "UPDATE pedidos SET codigo_rastreio = ? WHERE id = ?", 
                [codigo, pedidoId]
            );

            res.redirect("/dash?sucesso=true");
        } else {
            res.status(404).send("Pedido não encontrado.");
        }
    } catch (err) {
        console.error("Erro ao enviar rastreio:", err);
        res.status(500).send("Erro interno ao processar envio.");
    }
});

app.post("/enviar-email-rv", async (req, res)=>{
    const pedidoId = req.body.pedidoId;
    try {
        // 1. Busca os dados do cliente
        const [rows] = await pool.promise().query(
            "SELECT nome, email FROM pedidos WHERE id = ?", 
            [pedidoId]
        );
        if (rows.length > 0) {
            const cliente = rows[0];

            // 2. Configura o envio do e-mail com HTML
            const mailOptions = {
                from: process.env.SMTP_USER,
                to: cliente.email,
                subject: `Falta pouco, ${cliente.nome.split(' ')[0]}! Para seu pedido ser enviado 📦`,
                html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
    <!-- Header com cor de atenção/alerta (Amarelo ou Azul do MP) -->
    <div style="background-color: #009EE3; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 1.5rem;">Pendente: Finalize sua compra</h1>
    </div>

    <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Olá, <strong>${cliente.nome}</strong>,</p>
        
        <p>Notamos que houve um problema no processamento do seu pagamento e o seu pedido ainda não foi finalizado. Não se preocupe, seus itens ainda estão reservados!</p>
        
        <p>Para concluir sua compra com total segurança através do <strong>Mercado Pago</strong>, verifique as dúvidas mais comuns abaixo. Você poderá escolher entre Pix, Cartão de Crédito, Saldo Mercado pago ou Boleto:</p>

        

        <div style="background-color: #f9f9f9; border-left: 4px solid #009EE3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 0.9rem; color: #555;">
                <strong>Por que meu pagamento falhou?</strong><br>
                As causas mais comuns são dados de cartão incorretos, falta de limite ou instabilidade momentânea do banco. Tente novamente em alguns minutos ou escolha um novo método de pagamento.
            </p>
        </div>

        <p style="font-size: 0.9rem; color: #777; margin-top: 30px;">
            Se você já realizou o pagamento, por favor, desconsidere este e-mail. Se precisar de ajuda, basta responder a esta mensagem.<br><br>
            Atenciosamente, <strong>Equipe De vendas</strong>
        </p>
    </div>
</div>`
            };

            // Envia o e-mail
            await transporter.sendMail(mailOptions);
            //fim do if
            // Exemplo genérico de query
await pool.promise().query("UPDATE pedidos SET email_falha = true WHERE id = ?", [pedidoId]);

            res.redirect("/dash?sucesso=true");
        } else {
            res.status(404).send("Pedido não encontrado.");
        }
            
            }
            catch(err){
                res.status(500).send(`erro ao enviar email: ${err.message}`)
            }
})

//enviar sobre realizar compra
app.post("/enviar-email-rc", async (req, res)=>{
    const pedidoId = req.body.pedidoId;
    try {
        // 1. Busca os dados do cliente
        const [rows] = await pool.promise().query(
            "SELECT nome, email FROM pedidos WHERE id = ?", 
            [pedidoId]
        );
        if (rows.length > 0) {
            const cliente = rows[0];

            // 2. Configura o envio do e-mail com HTML
            const mailOptions = {
                from: process.env.SMTP_USER,
                to: cliente.email,
                subject: `Falta pouco, ${cliente.nome.split(' ')[0]}! Para seu pedido ser enviado 📦`,
                html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
    <!-- Header com cor de atenção/alerta (Amarelo ou Azul do MP) -->
    <div style="background-color: #009EE3; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 1.5rem;">Pendente: Finalize sua compra</h1>
    </div>

    <div style="padding: 20px; color: #333; line-height: 1.6;">
        <p>Olá, <strong>${cliente.nome}</strong>,</p>
        
        <p>Notamos que o seu pagamento e o seu pedido ainda não foi finalizado. Não se preocupe, seus itens ainda estão reservados!</p>
        
        <p>Para concluir sua compra com total segurança através do <strong>Mercado Pago</strong>, verifique as dúvidas mais comuns abaixo. Você poderá escolher entre Pix, Cartão de Crédito, Saldo Mercado pago ou Boleto:</p>

        

        <div style="background-color: #f9f9f9; border-left: 4px solid #009EE3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 0.9rem; color: #555;">
                <strong>Por que meu pagamento falhou?</strong><br>
                As causas mais comuns são dados de cartão incorretos, falta de limite ou instabilidade momentânea do banco. Tente novamente em alguns minutos ou escolha um novo método de pagamento.
            </p>
        </div>

        <p style="font-size: 0.9rem; color: #777; margin-top: 30px;">
            Se você já realizou o pagamento, por favor, desconsidere este e-mail. Se precisar de ajuda, basta responder a esta mensagem.<br><br>
            Atenciosamente, <strong>Equipe De vendas</strong>
        </p>
    </div>
</div>`
            };

            // Envia o e-mail
            await transporter.sendMail(mailOptions);
            //fim do if
            // Exemplo genérico de query
await pool.promise().query("UPDATE pedidos SET email_pendente = true WHERE id = ?", [pedidoId]);

            res.redirect("/dash?sucesso=true");
        } else {
            res.status(404).send("Pedido não encontrado.");
        }
            
            }
            catch(err){
                res.status(500).send(`erro ao enviar email: ${err.message}`)
            }
})

//middleware para limpar os arquivos
const limparUploads = (req, res, next) => {
  const pastaUploads = path.join(process.cwd(), "public/uploads");

  try {
    if (fs.existsSync(pastaUploads)) {
      const arquivos = fs.readdirSync(pastaUploads);

      arquivos.forEach(file => {
        const filePath = path.join(pastaUploads, file);
        fs.unlinkSync(filePath);
      });

      console.log("uploads antigos removidos");
    }

    next();
  } catch (err) {
    console.error("erro ao limpar uploads:", err);
    next();
  }
};


app.post(
  "/validateupload",
  limparUploads,
  upload.array('imagens', 4),
  async (req, res) => {
    const { preco_sem_desconto, preco, descricao, id } = req.body;
    
    try {
      // 1. Validação inicial de arquivos
      if (!req.files || req.files.length !== 4) {
        // O "return" é vital para parar a execução aqui!
        return res.status(400).send("Envie exatamente 4 imagens.");
      }

      // 2. Atualiza a tabela 'home'
      const sqlHome = "UPDATE home SET preco_sem_desconto = ?, preco_com_desconto = ?, descricao = ? WHERE id = ?";
      await pool.promise().query(sqlHome, [preco_sem_desconto, preco, descricao, id]);

      // 3. Atualiza as imagens
      const caminhos = req.files.map(file => file.filename);
      
      // Garante que o registro existe
      await pool.promise().query("INSERT IGNORE INTO imagens (id) VALUES (?)", [id]);

      const sqlImagens = `
        UPDATE imagens 
        SET caminho1 = ?, caminho2 = ?, caminho3 = ?, caminho4 = ? 
        WHERE id = ?
      `;
      await pool.promise().query(sqlImagens, [...caminhos, id]);

      // 4. Busca dados para renderizar a página final (se necessário)
      const dados_sql = "SELECT preco_sem_desconto, preco_com_desconto, descricao FROM home WHERE id = 1";
      let [resultadoHome] = await pool.promise().query(dados_sql);

      // 5. ENVIA A RESPOSTA ÚNICA (Sucesso)
      // Escolha apenas UM render ou redirect aqui
      console.log("dados do banco " + resultadoHome[0])
      res.render("dashboard", { 
          //status
        status: 'sucesso', 
        updated: "true",
        resultado_home: resultadoHome[0]});

    } catch (error) {
        res.render("dashboard", { 
          //status
        status: 'falha', 
        updated: "false", 
        resultado_home: resultadoHome[0]});
      console.error("Erro no processo:", error);
      // ENVIA A RESPOSTA ÚNICA (Erro)
      if (!res.headersSent) {
        res.redirect(`/dash?updated=false&error=${encodeURIComponent(error.message)}`);
      }
    }
  }
);





/*
app.post(
  "/validateupload",
  limparUploads,
  upload.array('imagens', 4),
  async (req, res) => {
      const {preco_sem_desconto, preco, descricao} = req.body;
      //preco_sem_desconto e preco descricao
      
    console.log("FILES:", req.files);
    console.log("ID:", req.body.id);
    //depois adicionar a coluna nome
    const sqlHome = "UPDATE home SET preco_sem_desconto = ?, preco_com_desconto = ?, descricao = ? WHERE id = 1"
    const dados_sql = "SELECT preco_sem_desconto, preco_com_desconto, descricao FROM home WHERE id = 1";
    try {
        
        try {
    await pool.promise().query(sqlHome, [preco_sem_desconto, preco, descricao]);
    let [resultadoHome] = await pool.promise().query(dados_sql);
    // Redireciona indicando sucesso
    res.render("home", {updated: true, resultado_home : resultadoHome}); 
} catch (error1) {
    console.error(error1);
    // Redireciona indicando falha e passando a mensagem de erro
    res.redirect(`/dash?updated=false&error=${encodeURIComponent(error1.message)}`);
}

      if (!req.files || req.files.length !== 4) {
        return res.status(400).send("Envie exatamente 4 imagens.");
      }

      const caminhos = req.files.map(file => file.filename);
      const idRegistro = req.body.id;

      // garante que existe
      await pool.promise().query(
        "INSERT IGNORE INTO imagens (id) VALUES (?)",
        [idRegistro]
      );

      const sql = `
        UPDATE imagens 
        SET caminho1 = ?, caminho2 = ?, caminho3 = ?, caminho4 = ? 
        WHERE id = ?
      `;

      const [result] = await pool.promise().query(sql, [
        caminhos[0],
        caminhos[1],
        caminhos[2],
        caminhos[3],
        idRegistro
      ]);

      console.log("RESULT:", result);

      res.render("dashboard", { status: 'sucesso' });

    } catch (error) {
      console.error("Erro ao atualizar banco:", error);
      res.status(500).send("Erro interno: " + error.message);
    }
});
*/


//enviar imagens pro servidor
/*
app.post("/validateupload", upload.array('imagens', 4), async  (req, res) => {
    const pastaUploads = path.join(process.cwd(), "public/uploads");
    
    
   
    try {
        // 🔥 apaga tudo dentro da pasta
        const arquivos = fs.readdirSync(pastaUploads);

        arquivos.forEach(file => {
            const filePath = path.join(pastaUploads, file);
            fs.unlinkSync(filePath);
        });
		console.log("uploads antigos removidos");
        
        // Como o front garante 4 arquivos, pegamos os nomes diretamente
        const caminhos = [
            req.files[0].filename,
            req.files[1].filename,
            req.files[2].filename,
            req.files[3].filename
        ];

        // SQL: SET coluna1 = ?, coluna2 = ? ...
        // Importante: use o WHERE para definir QUAL registro receberá essas fotos
        const sql = "UPDATE imagens SET caminho1 = ?, caminho2 = ?, caminho3 = ?, caminho4 = ? WHERE id = ?";
        
        // O ID geralmente vem de um campo oculto (input type="hidden") no seu form
        const idRegistro = req.body.id; 

        // Executa a query passando o array de caminhos + o ID
        await pool.promise().query(sql, [...caminhos, idRegistro]);

        // Renderiza a view (o Toast deve ser tratado no EJS/HTML como vimos antes)
        res.render("dashboard", { status: 'sucesso' });

    } catch (error) {
        console.error("Erro ao atualizar banco:", error);
        res.status(500).send("Erro interno no servidor. " + error.message);
    }
    
});
*/

app.get("/login", (req,res)=>{
  /*
  if(req.session.isLoged){
    res.redirect("/");
  }
  
  
  */
  res.render("login");
})

app.post("/loginuser", async (req, res) =>{
  try{
    console.log("Dados recebidos:", req.body);

    if (!req.body || !req.body.email) {
      return res.status(400).send("Dados do formulário não recebidos corretamente.");
    }
  const {email, senha, doisfa} = req.body;
  
  let sql = await "SELECT email, senha, two_factor_secret FROM usuarios WHERE user_id = 1";
  
  let [result] = await pool.promise().query(sql);
  if(result[0].email == email && result[0].senha == senha && result[0].two_factor_secret == doisfa){
      
      req.session.usuario = { email_u: result[0].email, logado: true };
      req.session.save((err) => {
  if (err) {
    console.error("Erro ao salvar sessão:", err);
    return res.render("login", { mensagem: "error_server" });
  }
  return res.redirect("/dash");
});
}
    //aqui devia levar pra rota dash que leva pro dashboard.handlear mas nao rolou
  /*
  if(req.session.usuario.logado){
  return res.redirect("/dash");
  }
      //criar cookie de sessao aqui
//return res.render("dashboard", { dados: result[0]});
  }
  else{
return res.render("login", {mensagem: "error_loging"})
  }
  */
  }
  catch(err){
    res.status(500).send(`erro : ${err.message}`)
  }
})

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.send('Erro ao sair');
    }
    res.clearCookie('connect.sid'); // Limpa o cookie da sessão
    res.redirect('/');
  });
});


app.use((req, res, next)=>{
    res.status(404).render("notfound")
})

app.listen(port, ()=>{
    console.log("servidor rodando na porta: " + port)
})



