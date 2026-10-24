-- planifier_resume.sql — Appel quotidien de la fonction Edge « resume-alertes ».
-- À exécuter une seule fois dans le SQL Editor, après la migration 0013, en remplaçant
-- <projet> par l'identifiant du projet Supabase (Project Settings → General → Project ID).
-- Chaque jour à 5 h 07 UTC (6 h 07 ou 7 h 07 en Belgique) ; la fonction n'envoie qu'une fois par
-- jour et par zone, et seulement s'il y a de nouvelles alertes. Relancer remplace la planification.

create extension if not exists pg_net;

select cron.schedule('suivi-linge-resume-alertes', '7 5 * * *', $$
  select net.http_post(
    url := 'https://<projet>.supabase.co/functions/v1/resume-alertes',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$$);
