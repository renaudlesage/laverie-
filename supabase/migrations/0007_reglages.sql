-- 0007_reglages.sql — Réglages de l'organisation modifiables par l'admin dans l'app.
-- À exécuter après 0006_enrolement.sql.
--
-- organisations.reglages (jsonb) :
--   activation_limites : 'au_moins_une' (défaut) | 'tous_traitements'
--       règle d'activation d'un article (invariant 9) : au moins une limite, ou une limite
--       pour chaque traitement actif de l'organisation
--   anti_doublon_ms    : fenêtre d'anti-doublon des lectures, de 500 à 60000 ms (défaut 2000)

begin;

alter table public.organisations
  add constraint organisations_reglages_valides check (
    jsonb_typeof(reglages) = 'object'
    and coalesce(reglages ->> 'activation_limites', 'au_moins_une') in ('au_moins_une', 'tous_traitements')
    and (reglages -> 'anti_doublon_ms' is null
         or (jsonb_typeof(reglages -> 'anti_doublon_ms') = 'number'
             and (reglages ->> 'anti_doublon_ms')::numeric between 500 and 60000))
  );

create function prive.regle_activation(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.reglages ->> 'activation_limites' from public.organisations o where o.id = org), 'au_moins_une');
$$;

-- Appelée par les déclencheurs des articles, qui s'exécutent avec les droits de l'utilisateur.
revoke all on function prive.regle_activation(uuid) from public, anon;
grant execute on function prive.regle_activation(uuid) to authenticated;

-- Activation : la notice est toujours exigée ; les limites selon la règle de l'organisation.
-- Les limites ne sont contrôlées qu'au passage à l'état actif, pour qu'un article déjà actif
-- reste modifiable si la règle change ensuite.
create or replace function public.verifier_article_activable() returns trigger
language plpgsql set search_path = '' as $$
declare
  manquants text;
begin
  if new.actif then
    if new.notice_chemin is null or btrim(new.notice_chemin) = '' then
      raise exception 'Article non activable : notice fabricant manquante'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' or not old.actif then
      if prive.regle_activation(new.organisation_id) = 'tous_traitements' then
        select string_agg('« ' || t.libelle || ' »', ', ' order by t.cree_le) into manquants
        from public.traitements t
        where t.organisation_id = new.organisation_id and t.actif
          and not exists (select 1 from public.articles_limites l where l.article_id = new.id and l.traitement_id = t.id);
        if manquants is not null then
          raise exception 'Article non activable : limite manquante pour %', manquants
            using errcode = 'check_violation';
        end if;
      elsif not exists (select 1 from public.articles_limites l where l.article_id = new.id) then
        raise exception 'Article non activable : aucune limite par traitement'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Retrait d'une limite d'un article actif : refusé si c'était la dernière, ou, avec la règle
-- « tous_traitements », si le traitement est actif.
create or replace function public.proteger_derniere_limite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.articles a where a.id = old.article_id and a.actif) then
    if not exists (
      select 1 from public.articles_limites l where l.article_id = old.article_id and l.id <> old.id
    ) then
      raise exception 'Impossible de retirer la dernière limite d''un article actif : désactivez-le d''abord'
        using errcode = 'check_violation';
    end if;
    if prive.regle_activation(old.organisation_id) = 'tous_traitements'
       and exists (select 1 from public.traitements t where t.id = old.traitement_id and t.actif) then
      raise exception 'Règle de la zone : un article actif garde une limite pour chaque traitement actif'
        using errcode = 'check_violation';
    end if;
  end if;
  return old;
end;
$$;

commit;
