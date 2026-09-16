-- Rename Huly-era columns to vendor-neutral pm_* (OpenProject).
-- Safe to run on fresh DBs that already use pm_* (IF EXISTS / IF NOT EXISTS).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'identity_map' AND column_name = 'huly_user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'identity_map' AND column_name = 'pm_user_id'
  ) THEN
    ALTER TABLE identity_map RENAME COLUMN huly_user_id TO pm_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_map' AND column_name = 'huly_project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_map' AND column_name = 'pm_project_id'
  ) THEN
    ALTER TABLE project_map RENAME COLUMN huly_project_id TO pm_project_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_map' AND column_name = 'huly_workspace_slug'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_map' AND column_name = 'pm_project_identifier'
  ) THEN
    ALTER TABLE project_map RENAME COLUMN huly_workspace_slug TO pm_project_identifier;
  END IF;
END $$;
