-- Change duration_minutes from INTEGER to DECIMAL to support second-level precision (h:mm:ss input)
ALTER TABLE workouts ALTER COLUMN duration_minutes TYPE DECIMAL(7,2);
