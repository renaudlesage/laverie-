-- amorcage.sql — Créer une organisation et son premier administrateur.
-- Pas une migration : à exécuter dans le SQL Editor, autant de fois que nécessaire,
-- après avoir créé l'utilisateur dans Authentication → Users → Add user.
-- Remplacer les deux valeurs entre guillemets, puis exécuter.

do $$
declare
  nom_organisation constant text := 'Zone de secours à renommer';
  email_admin constant text := 'admin@exemple.be';
  utilisateur uuid;
  organisation uuid;
begin
  select id into utilisateur from auth.users where lower(email) = lower(email_admin);
  if utilisateur is null then
    raise exception 'Aucun utilisateur avec l''e-mail %. Créez-le d''abord dans Authentication → Users.', email_admin;
  end if;

  insert into public.organisations (nom, type) values (nom_organisation, 'zone_secours')
  returning id into organisation;

  insert into public.membres (organisation_id, user_id, role) values (organisation, utilisateur, 'admin');

  raise notice 'Organisation « % » créée (%), administrateur : %', nom_organisation, organisation, email_admin;
end;
$$;
