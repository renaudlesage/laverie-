-- vider_zone.sql — Remise à zéro d'une zone DE TEST (vêtements, journal, lots, alertes…).
--
-- ATTENTION : irréversible. Le journal est normalement en ajout seul ; ce script lève cette
-- protection le temps de vider UNE zone, puis la rétablit (tout se passe dans une transaction :
-- en cas d'erreur, rien n'est modifié). Ne jamais l'utiliser sur une zone réelle.
--
-- 1. Remplacer le nom de la zone ci-dessous (exactement comme affiché dans l'app).
-- 2. Choisir de garder ou non les référentiels (sites, articles et limites, porteurs, sacs, lecteurs).
--    Les traitements, les membres et les réglages de la zone sont toujours conservés.
-- 3. Exécuter dans le SQL Editor de Supabase.
-- 4. Sur chaque appareil : se déconnecter puis se reconnecter (vide la base locale de l'appareil).

begin;

do $$
declare
  nom_zone text := 'ZS test';            -- ← nom exact de la zone à vider
  garder_referentiels boolean := true;   -- ← false : efface aussi sites, articles, porteurs, sacs, lecteurs
  org uuid;
  n integer;
begin
  select count(*), min(id::text)::uuid into n, org from public.organisations where nom = nom_zone;
  if n <> 1 then
    raise exception 'Zone « % » introuvable ou ambiguë (% trouvée(s))', nom_zone, n;
  end if;

  alter table public.evenements disable trigger evenements_ajout_seul;

  delete from public.alertes where organisation_id = org;
  delete from public.lectures_brutes where organisation_id = org;
  delete from public.resumes_envoyes where organisation_id = org;
  update public.evenements set annule_par = null where organisation_id = org and annule_par is not null;
  delete from public.evenements where organisation_id = org;
  update public.vetements set lot_id = null, porteur_id = null where organisation_id = org;
  delete from public.vetements where organisation_id = org; -- identifiants, compteurs et limites suivent
  delete from public.lots where organisation_id = org;

  if not garder_referentiels then
    delete from public.sacs where organisation_id = org;
    delete from public.porteurs where organisation_id = org;
    delete from public.lecteurs where organisation_id = org;
    update public.articles set actif = false where organisation_id = org;
    delete from public.articles_limites where organisation_id = org;
    delete from public.articles where organisation_id = org;
    update public.membres set site_id = null where organisation_id = org and role <> 'laverie_externe';
    delete from public.sites where organisation_id = org
      and id not in (select site_id from public.membres where organisation_id = org and site_id is not null);
  end if;

  alter table public.evenements enable trigger evenements_ajout_seul;
  raise notice 'Zone « % » remise à zéro', nom_zone;
end;
$$;

commit;

select 'Zone remise à zéro' as resultat;
