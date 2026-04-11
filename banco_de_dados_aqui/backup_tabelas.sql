Enter password: 
/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.5.2-MariaDB, for Android (aarch64)
--
-- Host: localhost    Database: orderFlow
-- ------------------------------------------------------
-- Server version	11.5.2-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `home`
--

DROP TABLE IF EXISTS `home`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `home` (
  `id` int(11) NOT NULL DEFAULT 1,
  `nome` varchar(800) NOT NULL,
  `descricao` varchar(5000) NOT NULL,
  `preco_sem_desconto` varchar(50) NOT NULL,
  `preco_com_desconto` varchar(50) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `home`
--

LOCK TABLES `home` WRITE;
/*!40000 ALTER TABLE `home` DISABLE KEYS */;
INSERT INTO `home` VALUES
(1,'iphone 17','Smartphone Premium X1 Eleve sua experiência com tecnologia de ponta e design elegante. Este dispositivo oferece performance ultra-rápida, câmera de alta resolução e bateria de longa duração para acompanhar seu ritmo. Processador: Octa-core 3.2GHz Memória: 8GB RAM / 256GB Armazenamento Tela: 6.7\" AMOLED 120Hz Cor: Preto Espacial','8500','4000.00');
/*!40000 ALTER TABLE `home` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `imagens`
--

DROP TABLE IF EXISTS `imagens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `imagens` (
  `id` int(11) NOT NULL DEFAULT 1,
  `caminho1` varchar(255) DEFAULT NULL,
  `caminho2` varchar(255) DEFAULT NULL,
  `caminho3` varchar(255) DEFAULT NULL,
  `caminho4` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `imagens`
--

LOCK TABLES `imagens` WRITE;
/*!40000 ALTER TABLE `imagens` DISABLE KEYS */;
INSERT INTO `imagens` VALUES
(1,'imagens-d6ff0a0c-9bf4-4b56-a86f-61806fa43fb21000078132.webp','imagens-7c910c02-ce0b-45aa-a742-9db1b6b9f9c11000078134.webp','imagens-f360c7a9-1df4-42e7-bd18-972b3b20ac7b1000078133.webp','imagens-8e92f2d8-5cf4-4de5-9684-e30585ac72501000078135.webp');
/*!40000 ALTER TABLE `imagens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pedidos`
--

DROP TABLE IF EXISTS `pedidos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pedidos` (
  `id` varchar(255) NOT NULL,
  `payment_id` varchar(255) DEFAULT NULL,
  `status_pagamento` enum('approved','pending','rejected') NOT NULL DEFAULT 'pending',
  `nome` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `cpf` varchar(50) NOT NULL,
  `telefone` varchar(50) NOT NULL,
  `endereco` varchar(255) NOT NULL,
  `numero` varchar(11) NOT NULL,
  `bairro` varchar(255) NOT NULL,
  `complemento` varchar(255) DEFAULT NULL,
  `cidade` varchar(255) NOT NULL,
  `estado` varchar(255) NOT NULL,
  `cep` varchar(50) NOT NULL,
  `data_pedido` timestamp NOT NULL DEFAULT current_timestamp(),
  `codigo_rastreio` varchar(50) DEFAULT NULL,
  `email_falha` tinyint(1) DEFAULT 0,
  `email_pendente` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_id` (`payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pedidos`
--

LOCK TABLES `pedidos` WRITE;
/*!40000 ALTER TABLE `pedidos` DISABLE KEYS */;
INSERT INTO `pedidos` VALUES
('0cfd919e-2b1c-4c4d-9e50-27ef54d750ce',NULL,'pending','kevin cedo','kevinborrachao@gmail.com','887836773-67','(98) 98983-7377','Travessa da Mangueira','45','Vila Palmeira','','São Luís','Maranhão','65045780','2026-04-11 03:28:14',NULL,0,0),
('216659c6-576b-4eea-aa77-d61b8b63cafb','151829845545','approved','kevin sthephan ribeiro marques ','kevinsthepan8@gmail.com','063660653-81','(98) 98551-2246','Rua do Maracajá','39','Anil','','São Luís','Maranhão','65045790','2026-03-30 20:23:08','777cxx#-+5',0,0),
('23f45655-a5c9-4aa0-867e-4a549244ea80','153243392142','approved','kevin nobody','kevinribeiro2077@gmail.com','063660653-81','(98) 98765-6543','Rua do Maracajá','87','Anil','','São Luís','Maranhão','65045790','2026-04-04 15:46:45',NULL,0,0),
('2b3226d0-901a-42d3-8578-c74176932fa4',NULL,'pending','kevinho ribeiro','kevinsthepan8@gmail.com','063660653-81','(98) 97655-7746','Rua do Maracajá','38','Anil','','São Luís','Maranhão','65045790','2026-04-04 15:07:41',NULL,0,1),
('2d19507b-2d6f-11f1-aa85-70586907e770','10001','approved','Lucas Oliveira','lucas.oli@email.com','11122233344','(11) 98888-1111','Rua A','10','Centro','','São Luís','Maranhão','65000000','2026-03-25 13:15:00',NULL,0,0),
('2d1b9509-2d6f-11f1-aa85-70586907e770','10002','approved','Mariana Santos','mari.santos@email.com','22233344455','(11) 98888-2222','Rua B','20','Anil','','São Luís','Maranhão','65000000','2026-03-25 17:30:00',NULL,0,0),
('2d1b9cbd-2d6f-11f1-aa85-70586907e770','10003','approved','Carla Souza','carla.sz@email.com','33344455566','(11) 98888-3333','Rua C','30','Cohama','','São Luís','Maranhão','65000000','2026-03-25 23:45:00',NULL,0,0),
('2d1b9de8-2d6f-11f1-aa85-70586907e770','20001','approved','Roberto Silva','roberto.silva@email.com','44455566677','(11) 97777-1111','Av. Litorânea','100','Calhau','Apto 1','São Luís','Maranhão','65000000','2026-03-26 12:00:00',NULL,0,0),
('2d1b9ed2-2d6f-11f1-aa85-70586907e770','20002','approved','Julia Mendes','julia.m@email.com','55566677788','(11) 97777-2222','Rua das Flores','55','Renascença','','São Luís','Maranhão','65000000','2026-03-26 14:20:00',NULL,0,0),
('2d1ba10d-2d6f-11f1-aa85-70586907e770','20003','approved','Fernando Vaz','fer.vaz@email.com','66677788899','(11) 97777-3333','Rua do Sol','12','Centro','','São Luís','Maranhão','65000000','2026-03-26 19:50:00',NULL,0,0),
('2d1ba1f4-2d6f-11f1-aa85-70586907e770','30001','approved','Patrícia Lima','patri.lima@email.com','77788899900','(11) 96666-1111','Rua de Nazaré','300','Centro','','São Luís','Maranhão','65000000','2026-03-27 11:30:00',NULL,0,0),
('2d1ba2b7-2d6f-11f1-aa85-70586907e770','30002','approved','Bruno Rocha','bruno.rocha@email.com','88899900011','(11) 96666-2222','Rua 01','05','Cohatrac','','São Luís','Maranhão','65000000','2026-03-27 15:00:00',NULL,0,0),
('2d1ba36f-2d6f-11f1-aa85-70586907e770','40001','approved','Aline Ferreira','aline.fer@email.com','99900011122','(11) 95555-1111','Av. Holandeses','500','Ponta d Areia','Sl 02','São Luís','Maranhão','65000000','2026-03-28 18:40:00',NULL,0,0),
('2d1ba40c-2d6f-11f1-aa85-70586907e770','50001','approved','Gabriel Costa','gabriel.c@email.com','00011122233','(11) 94444-1111','Rua da Paz','10','Centro','','São Luís','Maranhão','65000000','2026-03-29 13:00:00',NULL,0,0),
('2d1ba4b2-2d6f-11f1-aa85-70586907e770','50002','approved','Vanessa Ramos','vane.ramos@email.com','12121212121','(11) 94444-2222','Rua de São João','88','Centro','','São Luís','Maranhão','65000000','2026-03-30 01:15:00',NULL,0,0),
('31c2626b-28bc-408e-a62b-73b8bbb02c6b','154256011398','approved','fukashigi','kevinborrachao@gmail.com','063660653-88','(98) 98986-6866','Rua do Maracajá','87','Anil','','São Luís','Maranhão','65045790','2026-04-11 03:30:40',NULL,0,0),
('3e79d3ee-53fe-464d-bbe3-91ca5a35f26f',NULL,'pending','kevinho','kevinribeiro2077@gmail.com','063660653-81','(98) 98145-4748','Rua do Maracajá','39','Anil','','São Luís','Maranhão','65045790','2026-04-03 22:10:14',NULL,0,1),
('5331f6c1-2f7f-11f1-b3ee-af3c1fe72a1d','1234567890','rejected','Nome de Teste','kevinsthepan8@gmail.com','000.000.000-00','(98) 99999-9999','Rua das Oliveiras','100','Centro','Apto 101','São Luís','Maranhão','65000-000','2026-04-03 17:05:32',NULL,1,0),
('53fde5ac-eeba-4ddc-9cb4-af1b3df53072',NULL,'pending','kevin cedo','kevinborrachao@gmail.com','887836773-67','(98) 98983-7377','Travessa da Mangueira','45','Vila Palmeira','','São Luís','Maranhão','65045780','2026-04-11 03:27:39',NULL,0,0),
('658b1f2b-74ac-4780-8129-73e8d57e6cc0',NULL,'pending','kevinho ribeiro big time','kevinsthepan8@gmail.com','063660653-81','(98) 98165-8756','Travessa da Mangueira','65','Vila Palmeira','','São Luís','Maranhão','65045780','2026-04-04 15:12:16',NULL,0,1),
('8ca93be2-a5f6-453d-b1fb-2cb6f7f65f76',NULL,'pending','mr nobody','kevinribeiro2077@gmail.com','768686964-75','(97) 97886-8767','Rua das Brotas','87','Cutim Anil','','São Luís','Maranhão','65045660','2026-04-04 15:40:26',NULL,0,0),
('947d5b9b-016c-406d-aa85-8c20ea66be5e',NULL,'pending','kevinho ribeiro','kevinsthepan8@gmail.com','063660653-81','(98) 98756-8663','Rua do Maracajá','39','Anil','','São Luís','Maranhão','65045790','2026-04-03 22:34:48',NULL,0,0),
('a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5g6h7','1827364550','rejected','Lucas Oliveira','lucas.teste@email.com','12345678901','(98) 91111-2222','Rua das Flores','10','Centro',NULL,'São Luís','Maranhão','65000000','2026-04-03 01:08:15',NULL,0,0),
('af0761e4-e04a-4447-894b-58ecbc4a246c',NULL,'pending','kevin cedo','kevinborrachao@gmail.com','887836773-67','(98) 98983-7377','Travessa da Mangueira','45','Vila Palmeira','','São Luís','Maranhão','65045780','2026-04-11 03:19:36',NULL,0,0),
('b2c3d4e5-f6g7-4890-b1c2-d3e4f5g6h7i8','1827364551','rejected','Mariana Costa','mari.costa@email.com','23456789012','(98) 92222-3333','Av. Litorânea','100','Calhau',NULL,'São Luís','Maranhão','65076170','2026-04-03 01:08:15',NULL,0,0),
('b5028580-802e-4332-980f-5f2978893a03',NULL,'pending','kevin cedo','kevinborrachao@gmail.com','887836773-67','(98) 98983-7377','Travessa da Mangueira','45','Vila Palmeira','','São Luís','Maranhão','65045780','2026-04-11 03:18:02',NULL,0,0),
('ba4e1938-3b39-4d1c-9afd-0b26b713d227','153243595020','approved','kevin nobody','kevinribeiro2077@gmail.com','063660653-81','(98) 98765-7686','Rua do Maracajá','87','Anil','','São Luís','Maranhão','65045790','2026-04-04 15:48:18','oieuxbbdmmd88',0,0),
('bcb9a853-f466-4ea7-af40-8d284b12375a','152499391535','approved','mr nobody','kevinribeiro2077@gmail.com','065465767-74','(98) 98678-6676','Rua Dois','87','Outeiro da Cruz','','São Luís','Maranhão','65045760','2026-04-04 15:28:20',NULL,0,0),
('c3d4e5f6-g7h8-4901-c2d3-e4f5g6h7i8j9','1827364552','rejected','Ricardo Santos','ricardo.dev@email.com','34567890123','(98) 93333-4444','Rua do Sol','45','Cohab',NULL,'São Luís','Maranhão','65050001','2026-04-03 01:08:15',NULL,0,0),
('d1a0d056-e55c-43c3-968d-c2f7f3e4ed65',NULL,'pending','kevin','kevinribeiro2077@gmail.com','063660653-81','(98) 98551-2246','Rua do Maracajá','39','Anil','','São Luís','Maranhão','65045790','2026-03-28 15:36:05',NULL,0,1),
('d4e5f6g7-h8i9-4012-d3e4-f5g6h7i8j9k0','1827364553','rejected','Ana Beatriz','ana.beatriz@email.com','45678901234','(98) 94444-5555','Alameda das Palmeiras','22','Renascença',NULL,'São Luís','Maranhão','65075000','2026-04-03 01:08:15',NULL,0,0),
('e5f6g7h8-i9j0-4123-e4f5-g6h7i8j9k0l1','1827364554','rejected','Carlos Eduardo','cadu.vendas@email.com','56789012345','(98) 95555-6666','Travessa da Paz','300','Anjo da Guarda',NULL,'São Luís','Maranhão','65085000','2026-04-03 01:08:15',NULL,0,0),
('f4a20bc3-05bf-4750-9c11-279111ad37c9',NULL,'pending','kevin sthephan ribeiro marques','kevinsthepan8@gmail.com','063660653-81','(98) 98551-2246','Rua do Maracajá','39','Anil','','São Luís','Maranhão','65045790','2026-03-28 15:37:52',NULL,0,0),
('f89d2610-a31b-499c-9d96-1687cf9612ee',NULL,'pending','kevinho show time','kevinribeiro2077@gmail.com','064658657-78','(86) 99867-8866','Rua da Mangueira','76','Vila Palmeira','','São Luís','Maranhão','65045770','2026-04-04 15:19:03',NULL,0,0);
/*!40000 ALTER TABLE `pedidos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `usuarios` (
  `user_id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `senha` varchar(255) NOT NULL,
  `two_factor_secret` varchar(4) DEFAULT '8512',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuarios`
--

LOCK TABLES `usuarios` WRITE;
/*!40000 ALTER TABLE `usuarios` DISABLE KEYS */;
INSERT INTO `usuarios` VALUES
(1,'admin@eu.com','resident8512','8512');
/*!40000 ALTER TABLE `usuarios` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-04-11  0:40:23
