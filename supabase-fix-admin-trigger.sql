-- Correctif : le trigger trg_protect_profile_privileged_fields bloquait
-- aussi les mises à jour lancées directement depuis le SQL Editor Supabase
-- (auth.uid() y est NULL, donc is_admin était toujours faux et le trigger
-- réécrasait silencieusement new.role := old.role).
--
-- Ce patch autorise le passage quand auth.uid() est NULL (accès SQL Editor,
-- déjà de confiance car réservé au propriétaire du projet), tout en gardant
-- la protection intacte pour les appels faits depuis l'application par un
-- utilisateur normal (qui, eux, ont toujours un auth.uid() non nul).
--
-- À exécuter une fois dans le SQL Editor Supabase.

create or replace function public.protect_profile_privileged_fields()
returns trigger as $$
declare
  is_admin boolean;
  bypass boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  bypass := coalesce(current_setting('playstars.bypass_protect', true), '') = 'on';
  if bypass then
    return new;
  end if;

  -- Accès sans session utilisateur (SQL Editor, requête directe du
  -- propriétaire du projet) : déjà de confiance, on laisse passer.
  if auth.uid() is null then
    return new;
  end if;

  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') into is_admin;
  if not is_admin then
    new.role := old.role;
    new.status := old.status;
    new.developer_status := old.developer_status;
    new.developer_note := old.developer_note;
    new.used_slots := old.used_slots;
    new.confirmed_referrals := old.confirmed_referrals;
    new.referred_by := old.referred_by;
    new.referral_confirmed := old.referral_confirmed;
    new.referral_code := old.referral_code;
    new.quarantine_reason := old.quarantine_reason;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Applique enfin (maintenant que le trigger laisse passer) la promotion
-- que tu avais déjà tentée :
update public.profiles set role = 'admin' where id = 'b880b85d-b4d3-4cf3-acde-70fc87150928';

-- Vérification :
select id, username, role, status from public.profiles where id = 'b880b85d-b4d3-4cf3-acde-70fc87150928';
