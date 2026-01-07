# Current Task Status: Schema Migration Codemod Fixes

## Completed Tasks

### 1. Fix Type Import Path (✓)
- **Problem**: Generated code imported `Type` symbol from `@warp-drive/core/types/symbols` instead of deriving the path from `emberDataImportSource`
- **Solution**: Added `getTypeSymbolImportPath()` function in `ast-utils.ts` to derive the correct path
- **Example**: For `emberDataImportSource: "@auditboard/warp-drive/v1/model"`, the Type import becomes `@auditboard/warp-drive/v1/core-types/symbols`

### 2. Fix Duplicate Trait Imports/Extends (✓)
- **Problem**: Same trait appeared multiple times in imports and extends clauses
- **Solution**: Added deduplication using `[...new Set(mixinTraits)]` in `model-to-schema.ts`

### 3. Fix .js Extension in Trait Names (✓)
- **Problem**: Intermediate model paths like `base-model.js` generated traits named `BaseModel.jsTrait` instead of `BaseModelTrait`
- **Solution**: Added `.replace(/\.[jt]s$/, '')` to strip file extensions before converting to trait names

### 4. Add Model Base Property `id` to Intermediate Model Traits (✓)
- **Problem**: Generated traits didn't include `id` property, causing type errors in extensions using `this.id`
- **Solution**: Modified `generateIntermediateModelTraitArtifacts()` to automatically add `id: string | null` to all intermediate model trait types

## In Progress / Remaining Issues

### Store Type Issue
- **Problem**: Extensions access `this.store` but the Store type is application-specific
- **Current State**: `store` is NOT added to traits because the import path varies by application
- **Impact**: ~1000+ type errors in extension files for `this.store` access
- **Documented**: See `STORE_TYPE_ISSUE.md` for proposed solutions
- **Recommended Fix**: Add `storeType` configuration option to specify the Store type and import path

### Remaining Type Errors (~1002)
Most errors fall into these categories:

1. **Missing `store` property** - Extensions using `this.store` fail because Store type not in trait chain
2. **Module resolution errors** - Some external package models reference types not generated in target app
3. **Named vs default export mismatches** - Some generated imports use wrong export syntax

## Configuration Used (AuditBoard)

```json
{
  "emberDataImportSource": "@auditboard/warp-drive/v1/model",
  "intermediateModelPaths": [
    "soxhub-client/core/base-model",
    "soxhub-client/core/data-field-model",
    "@auditboard/client-core/core/-auditboard-model"
  ],
  ...
}
```

## Files Modified

### packages/codemods/src/schema-migration/utils/ast-utils.ts
- Added `getTypeSymbolImportPath()` function
- Modified `generateCommonWarpDriveImports()` to use derived Type path
- Added `storeImport` to common imports (currently unused)

### packages/codemods/src/schema-migration/model-to-schema.ts
- Added file extension stripping in `extractIntermediateModelTraits()`
- Added trait deduplication in `extractModelFields()`
- Added automatic `id` property injection in `generateIntermediateModelTraitArtifacts()`

### packages/codemods/src/schema-migration/config-schema.json
- No changes yet for store configuration

## Next Steps

1. **Commit current fixes** - The `id` property fix and documentation
2. **Add storeType configuration** (optional) - Allow applications to specify Store type
3. **Test with full codemod run** - Verify remaining errors are expected/acceptable
4. **Address module resolution issues** - Some may require config changes

## Test Commands

```bash
# Run codemod
cd /path/to/frontend/apps/client
npx tsx /path/to/codemods/bin/codemods.ts apply migrate-to-schema --config schema-migration.config.json ./app

# Run type check
pnpm lint:types

# Count errors
pnpm lint:types 2>&1 | grep -E "TS[0-9]+" | wc -l
```
