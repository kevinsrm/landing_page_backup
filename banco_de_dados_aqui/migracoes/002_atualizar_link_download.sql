-- ============================================================
-- Migração 002 — Atualiza o link padrão enviado no e-mail
-- ============================================================
-- O servidor também aplica esta atualização automaticamente na inicialização.
-- Links personalizados salvos pelo painel são preservados.
--
--   mysql -u USUARIO -p NOME_DO_BANCO < 002_atualizar_link_download.sql
-- ============================================================

UPDATE `home`
   SET `link_download` = 'https://drive.google.com/file/d/1aGqAKricXabwJk99y1BqO3eviPa26zu0/view?usp=drivesdk'
 WHERE `id` = 1
   AND (
     `link_download` IS NULL
     OR TRIM(`link_download`) = ''
     OR TRIM(`link_download`) = 'https://drive.google.com/file/d/1RGMlXew0zqldWRg38njBwOM8DJeDQ4rT/view'
   );
