-- Auto-provision weight and body fat metrics when a new user is created.
-- Uses the standard Supabase pattern: a SECURITY DEFINER function triggered
-- on auth.users INSERT. ON CONFLICT DO NOTHING makes it safe to re-run
-- and safe if the user somehow already has these IDs.

CREATE OR REPLACE FUNCTION public.provision_default_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO config (
    owner_id,
    metric_id,
    metric_name,
    type,
    active,
    private,
    "group",
    group_order,
    metric_order,
    show_ma,
    required,
    is_calculated
  ) VALUES
    (
      NEW.id, 'weight', 'Weight', 'number',
      true, false, 'Body', 0, 0, false, false, false
    ),
    (
      NEW.id, 'bodyfat', 'Body Fat %', 'number',
      true, false, 'Body', 0, 1, false, false, false
    )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (safe re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_default_metrics();
