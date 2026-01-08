# Outstanding Schema Migration Codemod Issues

Based on lint output (902 remaining errors after extension import fixes), here are the main categories:

## 1. TS2339 - Property does not exist (301 errors)

These fall into sub-categories:

### a) Services not on `this`
Extensions use `@service store`, `@service metrics` but TypeScript doesn't see them on the schema type.
```typescript
this.store.pushPayload(response);  // Property 'store' does not exist
this.metrics.trackEvent(...);       // Property 'metrics' does not exist
```

### b) Model methods missing
`belongsTo()`, `hasMany()`, `save()`, `isNew`, etc.
```typescript
this.belongsTo('auditsurveyable').id()  // Property 'belongsTo' does not exist
```

### c) Extension getters on related types
When accessing extension-defined properties through relationships.
```typescript
this.auditSurvey?.hasPermissionActionView  // Property doesn't exist on AuditSurveyExtension
```

## 2. TS2307 - Cannot find module (130 errors)

```typescript
import type { File } from 'soxhub-client/data/traits/file.schema.types';  // Module not found
import type ModelMixin from '../../utils/model-mixin';                      // Module not found
import type AuditQuestion from './app/models/audit-question';               // Wrong relative path
```

## 3. TS2551 - Property doesn't exist, did you mean... (66 errors)

Similar to TS2339 but TypeScript found a close match - usually typos or similar naming issues.

## 4. TS2531 - Object is possibly null (59 errors)

Nullable relationship access without null checks:
```typescript
this.auditSurveyBundleTemplate.adminTeams  // Object is possibly 'null'
```

## 5. TS2345 - Argument type mismatch (55 errors)

Type incompatibilities in function arguments.

## 6. TS2322 - Type assignment mismatch (51 errors)

Return types or assignments that don't match expected types:
```typescript
return this.reviewerUsers.map(...);  // Type '(X | null)[]' not assignable to 'X[]'
```

## 7. TS7006/TS7031 - Implicit any (42 errors)

Parameters or bindings without explicit types:
```typescript
.filter((team) => ...)  // Parameter 'team' implicitly has 'any' type
```

## 8. TS2305 - Module has no exported member (8 errors)

Importing non-existent exports:
```typescript
import type { Amendable } from 'soxhub-client/data/traits/amendable.schema.types';
```

## 9. TS2459 - Module declares X locally but not exported (8 errors)

```typescript
import type { DisplayableAmendmentChange } from 'soxhub-client/data/extensions/amendment';
// Interface exists but isn't exported
```

---

## Actionable Items for the Codemod

| Issue | Count | Codemod Fix? | Notes |
|-------|-------|--------------|-------|
| Model methods (`belongsTo`, `isNew`, etc.) | ~50 | ✅ Yes | Add to base trait generation |
| Missing trait files (`file.schema.types`) | ~20 | ✅ Yes | Ensure all mixins generate traits |
| Wrong relative paths (`./app/models/...`) | ~10 | ✅ Yes | Fix path resolution in extensions |
| Services on `this` | ~100 | ❌ No | Manual - keep services explicit |
| Null checks | ~60 | ❌ No | Code issue, not codemod |
| Type mismatches | ~100 | ❌ No | Code issue, not codemod |
| Implicit any | ~42 | ❌ No | Code issue, not codemod |
| Non-exported interfaces | ~8 | ⚠️ Maybe | Export them in extension generation |

## Priority Fixes for Codemod

### High Priority
1. **Add model methods to base trait** - Would fix ~50 errors
2. **Fix wrong relative paths in extensions** - Would fix ~10 errors
3. **Ensure missing traits are generated** - Would fix ~20 errors

### Medium Priority
4. **Export local interfaces in extensions** - Would fix ~8 errors

### Not Codemod Issues (Manual Fixes)
- Services on `this` - Extensions need to declare services explicitly
- Null checks - Code needs optional chaining or guards
- Type mismatches - Code needs type assertions or fixes
- Implicit any - Code needs explicit type annotations
