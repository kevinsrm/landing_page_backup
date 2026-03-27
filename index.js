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
     external_reference: meuPedidoId,
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
  const pedidoId = data.external_reference;
  
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
