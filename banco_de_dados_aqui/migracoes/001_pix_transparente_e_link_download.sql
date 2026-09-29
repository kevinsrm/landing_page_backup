-- =============================================================
-- Migração 001 — Checkout transparente PIX + link de download
-- =============================================================
-- Execute UMA vez no seu banco (o servidor também aplica estas
-- alterações automaticamente na inicialização, de forma idempotente).
--
--   mysql -u USUARIO -p NOME_DO_BANCO < 001_pix_transparente_e_link_download.sql
-- =============================================================

-- 1) Link enviado no e-mail quando o pagamento é aprovado
ALTER TABLE `home`
  ADD COLUMN `link_download` TEXT NULL;

-- 2) Controle de entrega digital + valor cobrado no pedido
ALTER TABLE `pedidos`
  ADD COLUMN `email_enviado` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `valor_total` DECIMAL(10,2) NULL;

-- 3) O produto é digital: endereço/telefone deixam de ser obrigatórios
ALTER TABLE `pedidos`
  MODIFY COLUMN `telefone`   VARCHAR(50)  NULL,
  MODIFY COLUMN `endereco`   VARCHAR(255) NULL,
  MODIFY COLUMN `numero`     VARCHAR(11)  NULL,
  MODIFY COLUMN `bairro`     VARCHAR(255) NULL,
  MODIFY COLUMN `cidade`     VARCHAR(255) NULL,
  MODIFY COLUMN `estado`     VARCHAR(255) NULL,
  MODIFY COLUMN `cep`        VARCHAR(50)  NULL;

-- 4) Tabela de reembolsos (usada pelo /suporte/reembolso e pelo painel)
CREATE TABLE IF NOT EXISTS `reembolsos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL,
  `payment_id` VARCHAR(255) NOT NULL,
  `motivo` VARCHAR(1000) NOT NULL,
  `status` ENUM('pendente','aprovado','recusado') NOT NULL DEFAULT 'pendente',
  `data_pedido` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5) (Opcional) defina o link de download direto no banco
-- UPDATE `home` SET `link_download` = 'https://drive.google.com/file/d/SEU-ARQUIVO/view' WHERE `id` = 1;
