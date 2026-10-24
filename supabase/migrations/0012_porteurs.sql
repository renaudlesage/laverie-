-- 0012_porteurs.sql — Fiche porteur, départ d'un pompier, anonymisation (bloc 1 après la V1).
-- À exécuter après 0011_alertes.sql.
--
-- Départ d'un pompier :
--   1. ses vêtements sont restitués (donnees.liberer = true : un vêtement nominatif redevient
--      banalisé et réattribuable, y compris s'il était déjà rendu au stock) ou réformés ; un
--      vêtement en laverie se libère à son retour ;
--   2. anonymiser_porteur efface nom, prénom, casier et lien au compte, remplace le matricule par
--      un code neutre et désactive la fiche. L'historique des vêtements reste entier : il ne
--      contient que l'identifiant opaque du porteur.

begin;

alter table public.porteurs add column anonymise_le timestamptz;

-- Copie de 0008_journal.sql, seule la restitution change.
create or replace function prive.appliquer(
  e prive.etat_vetement, type public.type_evenement, site uuid, lot uuid, quand timestamptz, d jsonb, nominatif boolean
) returns prive.etat_vetement
language plpgsql immutable set search_path = '' as $$
declare
  r prive.etat_vetement := e;
begin
  r.derniere_lecture_le := greatest(e.derniere_lecture_le, quand);

  case type
    when 'enrolement' then
      if e.statut is not null then
        raise exception 'Vêtement déjà enrôlé' using errcode = 'check_violation';
      end if;
      r := row('en_stock', false, site, null, null, quand, false)::prive.etat_vetement;

    when 'attribution' then
      perform prive.exiger_statut(e.statut, '{en_stock}', type);
      r.statut := 'en_service';
      r.porteur_id := (d ->> 'porteur_id')::uuid;
      r.site_id := coalesce(site, e.site_id);

    when 'restitution' then
      -- Restitution « libérée » (départ du porteur) : aussi pour un nominatif déjà rendu au stock.
      if coalesce((d ->> 'liberer')::boolean, false) then
        perform prive.exiger_statut(e.statut, '{en_service,en_stock}', type);
      else
        perform prive.exiger_statut(e.statut, '{en_service}', type);
      end if;
      r.statut := 'en_stock';
      -- Un vêtement nominatif reste lié à son porteur, sauf restitution « libérée » (départ du porteur).
      r.porteur_id := case when nominatif and not coalesce((d ->> 'liberer')::boolean, false) then e.porteur_id end;
      r.site_id := coalesce(site, e.site_id);

    when 'contamination' then
      perform prive.exiger_statut(e.statut, '{en_service,en_stock,collecte,en_laverie}', type);
      r.statut := case when e.statut in ('collecte', 'en_laverie') then 'en_laverie' else 'a_decontaminer' end;
      r.contamine := true;
      r.site_id := coalesce(site, e.site_id);

    when 'collecte' then
      perform prive.exiger_statut(e.statut, '{en_service,en_stock,a_decontaminer}', type);
      r.statut := 'collecte';
      r.lot_id := lot;

    when 'reception' then
      perform prive.exiger_statut(e.statut, '{collecte}', type);
      r.statut := 'en_laverie';
      r.site_id := coalesce(site, e.site_id);
      r.lot_id := null;

    when 'ajout_lot' then
      perform prive.exiger_statut(e.statut, '{en_laverie}', type);
      r.statut := 'en_traitement';
      r.lot_id := lot;

    when 'retrait_lot' then
      perform prive.exiger_statut(e.statut, '{en_traitement}', type);
      r.statut := 'en_laverie';
      r.lot_id := null;

    when 'traitement' then
      perform prive.exiger_statut(e.statut, '{en_traitement}', type);
      r.statut := 'traite';
      r.lot_id := null;
      r.controle_renforce := false; -- un nouveau passage appelle un nouveau contrôle

    when 'controle' then
      perform prive.exiger_statut(e.statut, '{traite}', type);
      r.statut := case d ->> 'verdict'
        when 'conforme' then 'pret'
        when 'a_reparer' then 'a_reparer'
        when 'reforme' then 'reforme'
      end;
      if r.statut is null then
        raise exception 'Contrôle : verdict attendu conforme, a_reparer ou reforme' using errcode = 'check_violation';
      end if;
      if d ->> 'verdict' = 'conforme' then
        r.controle_renforce := coalesce((d ->> 'renforce')::boolean, false);
        if coalesce((d ->> 'decontamine')::boolean, false) then r.contamine := false; end if;
      end if;

    when 'reparation' then
      perform prive.exiger_statut(e.statut, '{a_reparer}', type);
      r.statut := 'traite';

    when 'livraison' then
      perform prive.exiger_statut(e.statut, '{pret}', type);
      r.statut := case when e.porteur_id is not null then 'en_service' else 'en_stock' end;
      r.site_id := coalesce(site, e.site_id);

    when 'vu_en_inventaire' then
      r.site_id := coalesce(site, e.site_id);

    when 'perte' then
      perform prive.exiger_statut(e.statut,
        '{en_stock,en_service,a_decontaminer,collecte,en_laverie,en_traitement,traite,a_reparer,pret}', type);
      r.statut := 'perdu';

    when 'retrouve' then
      perform prive.exiger_statut(e.statut, '{perdu}', type);
      r.statut := 'en_stock';
      r.site_id := coalesce(site, e.site_id);

    when 'reforme' then
      perform prive.exiger_statut(e.statut,
        '{en_stock,en_service,a_decontaminer,collecte,en_laverie,en_traitement,traite,a_reparer,pret,perdu}', type);
      r.statut := 'reforme';
      r.porteur_id := null;
      r.lot_id := null;

    else
      raise exception 'Événement « % » sans effet de statut', type using errcode = 'check_violation';
  end case;
  return r;
end;
$$;


create function public.anonymiser_porteur(org uuid, porteur uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  nombre integer;
  code text;
begin
  if not prive.a_role(org, 'admin', 'gestionnaire') then
    raise exception 'Réservé aux administrateurs et gestionnaires' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.porteurs p where p.id = porteur and p.organisation_id = org) then
    raise exception 'Porteur introuvable' using errcode = 'no_data_found';
  end if;
  select count(*) into nombre from public.vetements v where v.porteur_id = porteur;
  if nombre > 0 then
    raise exception '% vêtement(s) encore liés à ce porteur : restituez-les ou réformez-les d''abord', nombre
      using errcode = 'check_violation';
  end if;
  code := 'ANONYME-' || upper(left(replace(porteur::text, '-', ''), 8));
  update public.porteurs set matricule = code, nom = null, prenom = null, casier = null, user_id = null,
    actif = false, anonymise_le = coalesce(anonymise_le, now())
  where id = porteur;
  return code;
end;
$$;

revoke all on function public.anonymiser_porteur(uuid, uuid) from public, anon;
grant execute on function public.anonymiser_porteur(uuid, uuid) to authenticated;

commit;
