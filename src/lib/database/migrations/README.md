# Database Migration System

This directory contains database migration scripts for the PsyMatch application.

## Auto-Migration System

The auto-migration system automatically checks and runs pending migrations when the server starts up.

### How It Works

1. **On Server Startup**: The system checks if migrations need to be run
2. **Smart Detection**: Only runs if Followup data exists but Status data is missing
3. **Idempotent**: Safe to run multiple times - won't duplicate data
4. **Tracked**: Records migration execution in the `migrations` collection

### Configuration

Enable/disable auto-migration via environment variable in `.env`:

```bash
# Enable auto-migration (recommended for development)
AUTO_RUN_MIGRATIONS=true

# Disable auto-migration (recommended for production)
AUTO_RUN_MIGRATIONS=false
```

### Migration Flow

```
Server Starts
    ↓
Check AUTO_RUN_MIGRATIONS
    ↓
If enabled → Check if migration needed
    ↓
    ├─ Already run? → Skip
    ├─ Fresh database? → Record and skip
    ├─ Already migrated? → Record and skip
    └─ Needs migration? → Run migration
        ↓
        ├─ Update Assignment.completedAt
        ├─ Migrate Followup → Status
        ├─ Create missing Status records
        └─ Record completion
```

### What Gets Migrated

#### 1. Assignment Updates

- Sets `completedAt` timestamp for completed assignments
- Uses Response.submittedAt or Assignment.assignedAt

#### 2. Followup → Status Migration

- Converts each Followup record to Status record
- Calculates appropriate status (onboarded/active/completed)
- Preserves assignment relationships
- Maintains activity timestamps

#### 3. Missing Status Records

- Creates Status for patients without Followup records
- Ensures all patients have Status tracking

### Status Calculation Logic

```javascript
if (no assignments) → 'onboarded'
if (has downloaded OR all completed/downloaded) → 'completed'
if (has pending) → 'active'
else → 'onboarded'
```

### Console Output

The migration provides detailed console output:

```
🔄 Auto-migration enabled - checking for pending migrations...
📊 Migration check:
   - Followup records: 15
   - Status records: 0
   - Total patients: 20
🚀 Migration needed - starting automatic migration...
🔄 Starting Followup to Status migration...
  ℹ️  Found 10 completed assignments to update
  ℹ️  Found 15 Followup records to migrate
  ℹ️  Found 5 patients without Status records
  ✅ Migration completed successfully
     - Updated 10 assignments
     - Migrated 15 followup records
     - Created 5 new status records
✅ Auto-migration completed successfully
```

### Migration Tracking

Migrations are tracked in the `migrations` collection:

```javascript
{
  name: "followup-to-status-migration",
  executedAt: ISODate("2025-01-07T13:00:00.000Z"),
  status: "completed",
  details: "Migrated 15 followups, created 5 new statuses"
}
```

### Manual Migration

If you prefer to run migrations manually:

1. **Disable auto-migration**:

   ```bash
   AUTO_RUN_MIGRATIONS=false
   ```

2. **Run the standalone script**:

   ```bash
   # Dry run (preview only)
   node src/lib/database/migrations/followup-to-status-migration.js --dry-run

   # Execute migration
   node src/lib/database/migrations/followup-to-status-migration.js

   # Rollback if needed
   node src/lib/database/migrations/followup-to-status-migration.js --rollback
   ```

### Safety Features

✅ **Idempotent**: Can be run multiple times safely
✅ **Tracked**: Won't run if already completed
✅ **Smart**: Only runs when actually needed
✅ **Logged**: Detailed console output
✅ **Error Handling**: Records failures for debugging

### Production Deployment

For production environments:

1. **Disable auto-migration**:

   ```bash
   AUTO_RUN_MIGRATIONS=false
   ```

2. **Run migration manually** during maintenance window

3. **Verify results** before resuming normal operations

4. **Monitor logs** for any issues

### Troubleshooting

#### Migration Not Running

Check:

- `AUTO_RUN_MIGRATIONS=true` in `.env`
- Server logs for migration messages
- Database connectivity

#### Migration Failed

1. Check error message in console
2. Review `migrations` collection for failure details
3. Fix underlying issue
4. Delete failed migration record
5. Restart server to retry

#### Rollback Needed

```bash
node src/lib/database/migrations/followup-to-status-migration.js --rollback
```

This will:

- Delete all Status records
- Restore Followup records from backup
- Remove migration tracking record

### Files

- `auto-migrate.js` - Auto-migration system (runs on startup)
- `followup-to-status-migration.js` - Standalone migration script
- `README.md` - This file

### Support

For issues or questions about migrations, check:

1. Console logs during server startup
2. `migrations` collection in database
3. Implementation checklist in `.issues/IMPLEMENTATION_CHECKLIST.md`
