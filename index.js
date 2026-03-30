import express from "express";
import {engine} from "express-handlebars";
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const access_token = process.env.ACCESS_TOKEN;
// database.js
import mysql from 'mysql2';

// Configure and create the pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 50, // Adjust based on needs
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
      shipments: {
  mode: 'not_specified',
  cost: 50, // Custo fixo que você definiu
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
res.redirect(data.init_point);
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


app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', 'views') ;

app.get("/", (req,res)=>{

res.render("home");
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


app.listen(port, ()=>{
console.log(`servidor rodando na porta ${port}`);
})
