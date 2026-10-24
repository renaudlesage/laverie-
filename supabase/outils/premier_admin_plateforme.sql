-- premier_admin_plateforme.sql — Désigner le premier administrateur de la plateforme.
-- À exécuter une fois dans le SQL Editor, après la migration 0014, en remplaçant l'e-mail.
-- La personne doit s'être déjà connectée une fois à l'app. Les suivants s'ajoutent dans l'app
-- (espace Plateforme → Administrateurs de la plateforme).

insert into public.plateforme_admins (user_id)
select id from auth.users where lower(email) = lower('prenom.nom@exemple.be')
on conflict (user_id) do update set actif = true, retire_le = null
returning user_id;
