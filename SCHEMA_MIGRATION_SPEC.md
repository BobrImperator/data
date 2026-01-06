# Schema Migration Codemod Specification

## Overview

The schema migration codemod is a comprehensive tool that transforms EmberData models and mixins into WarpDrive's new schema system. It consists of three main transformations that work together to migrate an entire codebase:

1. **migrate-to-schema**: Batch orchestration layer that discovers, analyzes, and processes files
2. **model-to-schema**: Transforms EmberData Model classes into WarpDrive Resource schemas
3. **mixin-to-schema**: Transforms EmberData Mixins into WarpDrive Trait schemas

## Architecture

### Core Components

```
migrate-to-schema.ts (Orchestrator)
├── File Discovery
│   ├── Discovers models from modelSourceDir and additionalModelSources
│   ├── Discovers mixins from mixinSourceDir and additionalMixinSources
│   └── Validates files using AST parsing
├── Dependency Analysis
│   ├── Analyzes mixin usage (direct and transitive)
│   ├── Identifies polymorphic relationships
│   └── Builds dependency graph
├── Processing Pipeline
│   ├── Processes intermediate models first (generates traits)
│   ├── Processes regular models (generates schemas)
│   └── Processes mixins (generates traits)
└── Artifact Generation
    ├── Writes schemas to resourcesDir
    ├── Writes traits to traitsDir
    └── Writes extensions to extensionsDir

model-to-schema.ts (Model Transformer)
├── Model Analysis
│   ├── Validates model class structure
│   ├── Extracts schema fields (@attr, @belongsTo, @hasMany)
│   ├── Extracts extension properties (methods, computeds)
│   └── Identifies mixin traits
└── Artifact Generation
    ├── Schema artifact (.schema.ts/.js)
    ├── Type artifact (.schema.types.ts)
    └── Extension artifact (.ts/.js)

mixin-to-schema.ts (Mixin Transformer)
├── Mixin Analysis
│   ├── Validates Mixin.create() structure
│   ├── Extracts trait fields (decorator-based)
│   ├── Extracts extension properties
│   └── Identifies extended traits
└── Artifact Generation
    ├── Trait schema artifact (.schema.ts/.js)
    ├── Trait type artifact (.schema.types.ts)
    └── Extension artifact (if needed)
```

## Configuration

### Configuration Options

```typescript
interface TransformOptions {
  // Input/Output
  inputDir?: string;              // Base directory for file discovery
  outputDir?: string;             // Fallback output directory
  modelSourceDir?: string;        // Primary model directory (default: ./app/models)
  mixinSourceDir?: string;        // Primary mixin directory (default: ./app/mixins)
  resourcesDir?: string;          // Output for schema files (default: ./app/data/resources)
  traitsDir?: string;             // Output for trait files (default: ./app/data/traits)
  extensionsDir?: string;         // Output for extension files (default: ./app/data/extensions)

  // Import Sources
  emberDataImportSource?: string;         // EmberData import source (default: @ember-data/model)
  modelImportSource?: string;             // Base import for models
  resourcesImport?: string;               // Import path for generated resources
  traitsImport?: string;                  // Import path for generated traits
  extensionsImport?: string;              // Import path for generated extensions

  // Additional Sources
  additionalModelSources?: Array<{
    pattern: string;              // Import pattern to match (supports wildcards)
    dir: string;                  // Directory containing files
  }>;
  additionalMixinSources?: Array<{
    pattern: string;
    dir: string;
  }>;

  // Intermediate Models
  intermediateModelPaths?: string[];      // Paths to intermediate models (become traits)

  // Behavior
  dryRun?: boolean;               // Preview changes without writing
  verbose?: boolean;              // Detailed logging
  debug?: boolean;                // Debug-level logging
  skipProcessed?: boolean;        // Skip files with existing output
  mixinsOnly?: boolean;           // Only process mixins
  modelsOnly?: boolean;           // Only process models
  generateExternalResources?: boolean;    // Generate schemas for external models

  // Type Mapping
  typeMapping?: Record<string, string>;   // Custom transform type mappings
}
```

### Configuration File

The codemod supports JSON configuration files:

```json
{
  "$schema": "./config-schema.json",
  "version": "1.0.0",
  "modelSourceDir": "./app/models",
  "mixinSourceDir": "./app/mixins",
  "resourcesDir": "./app/data/resources",
  "traitsDir": "./app/data/traits",
  "extensionsDir": "./app/data/extensions",
  "resourcesImport": "my-app/data/resources",
  "traitsImport": "my-app/data/traits",
  "extensionsImport": "my-app/data/extensions",
  "emberDataImportSource": "@ember-data/model",
  "intermediateModelPaths": [
    "my-app/models/base-model",
    "my-app/models/data-field-model"
  ],
  "additionalModelSources": [
    {
      "pattern": "external-package/models/*",
      "dir": "node_modules/external-package/addon/models/*"
    }
  ],
  "typeMapping": {
    "uuid": "string",
    "currency": "number"
  }
}
```

## Transformation Process

### Phase 1: File Discovery and Validation

The orchestrator discovers and validates files:

1. **Glob Pattern Matching**
   - Finds all `.js` and `.ts` files in configured directories
   - Includes additionalModelSources and additionalMixinSources
   - Filters out already processed files if `skipProcessed` is true

2. **AST Validation**
   - Parses each file to ensure valid syntax
   - Categorizes as model or mixin based on imports
   - Caches file contents for later processing

3. **File Categorization**
   ```typescript
   // Model identification
   - Has import from @ember-data/model or configured source
   - Default export extends Model class
   - May extend intermediate models

   // Mixin identification
   - Has import from @ember/object/mixin
   - Default export is Mixin.create(...) or Mixin.createWithMixins(...)
   ```

### Phase 2: Dependency Analysis

The orchestrator builds a complete dependency graph:

1. **Mixin Usage Analysis**
   - **Direct Usage**: Models that import and extend mixins
   - **Transitive Usage**: Mixins that extend other mixins
   - **Polymorphic References**: belongsTo relationships with polymorphic types

2. **Dependency Graph**
   ```
   Model A extends Model.extend(MixinA, MixinB)
   └── MixinA extends Mixin.create(...)
   └── MixinB extends Mixin.createWithMixins(MixinC, {...})
       └── MixinC extends Mixin.create(...)

   Result: MixinA, MixinB, MixinC are all "connected" to models
   ```

3. **Import Path Resolution**
   - Resolves relative imports (./foo, ../bar)
   - Matches external imports using additionalMixinSources patterns
   - Handles wildcard patterns (e.g., `package/mixins/*`)

### Phase 3: Processing Pipeline

Files are processed in dependency order:

#### 3.1 Intermediate Model Processing

Intermediate models are processed first to generate their trait definitions:

**Input**: Intermediate Model
```typescript
// models/base-model.ts
import Model, { attr } from '@ember-data/model';

export default class BaseModel extends Model {
  @attr('date') createdAt;
  @attr('date') updatedAt;

  get isNew() {
    return this.createdAt === null;
  }
}
```

**Output**: Trait Schema + Extension
```typescript
// traits/base-model.schema.ts
export const BaseModelTrait = {
  name: 'base-model',
  mode: 'legacy',
  fields: [
    { name: 'createdAt', kind: 'attribute', type: 'date' },
    { name: 'updatedAt', kind: 'attribute', type: 'date' }
  ]
};

// traits/base-model.schema.types.ts
export interface BaseModelTrait {
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

// extensions/base-model.ts
export class BaseModelExtension {
  get isNew(): boolean {
    return this.createdAt === null;
  }
}
```

#### 3.2 Regular Model Processing

**Input**: Model with Decorators
```typescript
// models/user.ts
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
  @attr('string') email;
  @belongsTo('company', { async: false }) company;
  @hasMany('post', { async: true }) posts;

  // Extension property
  get displayName() {
    return this.name || this.email;
  }

  // Extension method
  async activate() {
    // ...
  }
}
```

**Output**: Schema + Types + Extension
```typescript
// resources/user.schema.ts
export const UserSchema = {
  type: 'user',
  legacy: true,
  identity: { kind: '@id', name: 'id' },
  fields: [
    { name: 'name', kind: 'attribute', type: 'string' },
    { name: 'email', kind: 'attribute', type: 'string' },
    { name: 'company', kind: 'belongsTo', type: 'company', options: { async: false } },
    { name: 'posts', kind: 'hasMany', type: 'post', options: { async: true } }
  ],
  objectExtensions: ['UserExtension']
};

// resources/user.schema.types.ts
import type { Company } from '../resources/company.schema.types';
import type { Post } from '../resources/post.schema.types';
import type { HasMany } from '@ember-data/model';
import type { UserExtensionSignature } from '../extensions/user';

export interface User extends UserExtensionSignature {
  readonly [Type]: 'user';
  readonly name: string | null;
  readonly email: string | null;
  readonly company: Company | null;
  readonly posts: HasMany<Post>;
}

// extensions/user.ts
import type { User } from '../resources/user.schema.types';

export interface UserExtension extends User {}

export class UserExtension {
  get displayName(): string {
    return this.name || this.email;
  }

  async activate(): Promise<void> {
    // ...
  }
}

export type UserExtensionSignature = typeof UserExtension;
```

#### 3.3 Model with Mixins

**Input**: Model Using Mixins
```typescript
// models/auditable-user.ts
import Model, { attr } from '@ember-data/model';
import AuditableMixin from '../mixins/auditable';

export default class AuditableUser extends Model.extend(AuditableMixin) {
  @attr('string') username;
}

// mixins/auditable.ts
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  createdBy: attr('string'),
  updatedBy: attr('string'),

  getAuditInfo() {
    return `Created by: ${this.createdBy}`;
  }
});
```

**Output**: Model Schema + Mixin Trait
```typescript
// resources/auditable-user.schema.ts
export const AuditableUserSchema = {
  type: 'auditable-user',
  legacy: true,
  identity: { kind: '@id', name: 'id' },
  fields: [
    { name: 'username', kind: 'attribute', type: 'string' }
  ],
  traits: ['auditable']
};

// traits/auditable.schema.ts
export const AuditableTrait = {
  name: 'auditable',
  mode: 'legacy',
  fields: [
    { name: 'createdBy', kind: 'attribute', type: 'string' },
    { name: 'updatedBy', kind: 'attribute', type: 'string' }
  ]
};

// extensions/auditable.ts
export class AuditableExtension {
  getAuditInfo(): string {
    return `Created by: ${this.createdBy}`;
  }
}
```

#### 3.4 Mixin Processing

Only "connected" mixins (used by models) are transformed:

**Input**: Mixin with Fields
```typescript
// mixins/timestamped.ts
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  createdAt: attr('date'),
  updatedAt: attr('date'),

  get age() {
    return Date.now() - this.createdAt;
  }
});
```

**Output**: Trait + Extension
```typescript
// traits/timestamped.schema.ts
export const TimestampedTrait = {
  name: 'timestamped',
  mode: 'legacy',
  fields: [
    { name: 'createdAt', kind: 'attribute', type: 'date' },
    { name: 'updatedAt', kind: 'attribute', type: 'date' }
  ]
};

// traits/timestamped.schema.types.ts
export interface TimestampedTrait {
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
}

// extensions/timestamped.ts
export class TimestampedExtension {
  get age(): number {
    return Date.now() - this.createdAt;
  }
}
```

### Phase 4: Artifact Generation

Each transformation produces multiple artifacts:

#### Artifact Types

1. **Schema Artifacts** (`.schema.ts` or `.schema.js`)
   - Contains the resource/trait schema definition
   - Uses legacy schema format
   - Includes field definitions
   - References traits and extensions

2. **Type Artifacts** (`.schema.types.ts`)
   - Always TypeScript, even if source is JavaScript
   - Interface definitions for resources/traits
   - Imports related types
   - Includes proper readonly/optional modifiers

3. **Extension Artifacts** (`.ts` or `.js`)
   - Preserves original file structure
   - Extracts non-schema properties
   - Implements corresponding interface
   - For TypeScript: uses declaration merging
   - For JavaScript: uses JSDoc type annotations

#### File Naming Conventions

```
Original: user.ts
├── user.schema.ts          (schema definition)
├── user.schema.types.ts    (type interface)
└── user.ts                 (extension - if needed)

Original: auditable.ts (mixin)
├── auditable.schema.ts         (trait definition)
├── auditable.schema.types.ts   (trait interface)
└── auditable.ts                (extension - if needed)
```

## Schema Format Differences

**IMPORTANT:** Resources and Traits use different schema formats:

### Resource Schema Format
Resources (generated from models) use:
```typescript
export const UserSchema = {
  type: 'user',              // Type identifier (kebab-case)
  legacy: true,              // Boolean property
  identity: { kind: '@id', name: 'id' },  // Always present
  fields: [...],
  traits: [...],             // Optional: trait references
  objectExtensions: [...]    // Optional: extension references
};
```

### Trait Schema Format
Traits (generated from mixins or intermediate models) use:
```typescript
export const TimestampedTrait = {
  name: 'timestamped',       // Trait name (kebab-case)
  mode: 'legacy',            // String property (not 'legacy: true')
  fields: [...],
  traits: [...]              // Optional: other traits this extends
};
```

**Key Differences:**
- Resources use `legacy: true` (boolean), traits use `mode: 'legacy'` (string)
- Resources have `type` property, traits have `name` property
- Resources always include `identity` field, traits do not
- Resources use `objectExtensions`, traits do not have this property

## Field Transformation Rules

### Attribute Fields

**Input Formats:**
```typescript
@attr('string') name;
@attr('number') age;
@attr('boolean') isActive;
@attr('date') createdAt;
@attr('custom-transform') customField;
```

**Output Schema:**
```typescript
{ name: 'name', kind: 'attribute', type: 'string' }
{ name: 'age', kind: 'attribute', type: 'number' }
{ name: 'isActive', kind: 'attribute', type: 'boolean' }
{ name: 'createdAt', kind: 'attribute', type: 'date' }
{ name: 'customField', kind: 'attribute', type: 'custom-transform' }
```

**Output Types:**
```typescript
readonly name: string | null;
readonly age: number | null;
readonly isActive: boolean | null;
readonly createdAt: Date | null;
readonly customField: CustomType | null;  // Uses typeMapping
```

### BelongsTo Relationships

**Input Formats:**
```typescript
@belongsTo('user', { async: false }) user;
@belongsTo('company', { async: true }) company;
@belongsTo('parent', { inverse: 'children' }) parent;
@belongsTo('commentable', { polymorphic: true }) commentable;
```

**Output Schema:**
```typescript
{ name: 'user', kind: 'belongsTo', type: 'user', options: { async: false } }
{ name: 'company', kind: 'belongsTo', type: 'company', options: { async: true } }
{ name: 'parent', kind: 'belongsTo', type: 'parent', options: { inverse: 'children' } }
{ name: 'commentable', kind: 'belongsTo', type: 'commentable', options: { polymorphic: true } }
```

**Output Types:**
```typescript
readonly user: User | null;
readonly company: Company | null;
readonly parent: Parent | null;
readonly commentable: Commentable | null;  // Polymorphic trait interface
```

### HasMany Relationships

**Input Formats:**
```typescript
@hasMany('post', { async: true }) posts;
@hasMany('comment', { async: false }) comments;
@hasMany('child', { inverse: 'parent' }) children;
```

**Output Schema:**
```typescript
{ name: 'posts', kind: 'hasMany', type: 'post', options: { async: true } }
{ name: 'comments', kind: 'hasMany', type: 'comment', options: { async: false } }
{ name: 'children', kind: 'hasMany', type: 'child', options: { inverse: 'parent' } }
```

**Output Types:**
```typescript
readonly posts: AsyncHasMany<Post>;
readonly comments: HasMany<Comment>;
readonly children: HasMany<Child>;
```

## Extension Property Rules

### Computed Properties

**Input:**
```typescript
get fullName() {
  return `${this.firstName} ${this.lastName}`;
}
```

**Output:**
```typescript
// Extension file
get fullName(): string {
  return `${this.firstName} ${this.lastName}`;
}
```

### Methods

**Input:**
```typescript
async save() {
  await this.validate();
  return super.save();
}
```

**Output:**
```typescript
// Extension file
async save(): Promise<void> {
  await this.validate();
  return super.save();
}
```

### Decorated Methods

**Input:**
```typescript
@action
handleClick() {
  // ...
}
```

**Output:**
```typescript
// Extension file - preserves decorators
@action
handleClick(): void {
  // ...
}
```

## Special Cases

### 1. Intermediate Models

Models configured as `intermediateModelPaths` generate traits instead of schemas:

```typescript
// Configuration
{
  "intermediateModelPaths": ["app/models/base-model"]
}

// Input: models/base-model.ts
export default class BaseModel extends Model {
  @attr('date') createdAt;
}

// Output: traits/base-model.schema.ts (not resources/)
export const BaseModelTrait = {
  name: 'base-model',
  mode: 'legacy',
  fields: [...]
};
```

### 2. External Models

Models from external packages can be processed using `additionalModelSources`:

```typescript
{
  "additionalModelSources": [
    {
      "pattern": "external-addon/models/*",
      "dir": "node_modules/external-addon/addon/models/*"
    }
  ],
  "generateExternalResources": true
}
```

### 3. Polymorphic Relationships

Mixins referenced in polymorphic relationships are automatically included:

```typescript
// Model
@belongsTo('commentable', { polymorphic: true }) commentable;

// Mixin named 'commentable'
// -> Automatically transformed to trait, even if not directly extended
```

### 4. Trait Extension

Mixins can extend other mixins:

```typescript
// Input
export default Mixin.createWithMixins(BaseMixin, {
  extraField: attr('string')
});

// Output
export const MyTrait = {
  name: 'my',
  mode: 'legacy',
  traits: ['base'],  // References BaseMixin -> base trait
  fields: [
    { name: 'extraField', kind: 'attribute', type: 'string' }
  ]
};
```

### 5. JavaScript vs TypeScript

The codemod handles both languages:

**JavaScript Output:**
```javascript
// Extension file
/** @import { User } from '../resources/user.schema.types' */
/** @type {{ new(): User }} */
const Base = class {};

export class UserExtension extends Base {
  get displayName() {
    return this.name;
  }
}

/** @typedef {typeof UserExtension} UserExtensionSignature */
```

**TypeScript Output:**
```typescript
// Extension file
import type { User } from '../resources/user.schema.types';

export interface UserExtension extends User {}

export class UserExtension {
  get displayName(): string {
    return this.name;
  }
}

export type UserExtensionSignature = typeof UserExtension;
```

## Error Handling

### Validation Errors

The codemod validates files before processing:

1. **Invalid Syntax**: Files that fail AST parsing are skipped with warnings
2. **Invalid Structure**: Files without proper model/mixin structure are skipped
3. **Missing Imports**: Files without required decorator imports are skipped

### Missing Dependencies

Dependencies are resolved gracefully:

1. **Missing Mixin Files**: Warnings logged, trait imports skipped
2. **Missing Resource Types**: Stub interfaces created automatically
3. **Unresolved Imports**: Warnings logged, continue processing

### Circular Dependencies

The codemod handles circular dependencies through topological sorting:

1. Intermediate models processed in dependency order
2. Circular trait references logged as warnings
3. Processing continues without generating invalid imports

## Output Examples

### Complete Example: Blog Post Model

**Input:**
```typescript
// models/blog-post.ts
import Model, { attr, belongsTo, hasMany } from '@ember-data/model';
import TimestampedMixin from '../mixins/timestamped';
import AuditableMixin from '../mixins/auditable';

export default class BlogPost extends Model.extend(
  TimestampedMixin,
  AuditableMixin
) {
  @attr('string') title;
  @attr('string') body;
  @attr('boolean') published;

  @belongsTo('user', { async: true }) author;
  @hasMany('comment', { async: true, inverse: 'post' }) comments;

  get excerpt() {
    return this.body?.substring(0, 100) + '...';
  }

  async publish() {
    this.published = true;
    await this.save();
  }
}
```

**Output Files:**

```typescript
// resources/blog-post.schema.ts
export const BlogPostSchema = {
  type: 'blog-post',
  legacy: true,
  identity: { kind: '@id', name: 'id' },
  fields: [
    { name: 'title', kind: 'attribute', type: 'string' },
    { name: 'body', kind: 'attribute', type: 'string' },
    { name: 'published', kind: 'attribute', type: 'boolean' },
    { name: 'author', kind: 'belongsTo', type: 'user', options: { async: true } },
    { name: 'comments', kind: 'hasMany', type: 'comment', options: { async: true, inverse: 'post' } }
  ],
  traits: ['timestamped', 'auditable'],
  objectExtensions: ['BlogPostExtension']
};

// resources/blog-post.schema.types.ts
import type { User } from '../resources/user.schema.types';
import type { Comment } from '../resources/comment.schema.types';
import type { AsyncHasMany } from '@ember-data/model';
import type { TimestampedTrait } from '../traits/timestamped.schema.types';
import type { AuditableTrait } from '../traits/auditable.schema.types';
import type { BlogPostExtensionSignature } from '../extensions/blog-post';
import type { Type } from '@warp-drive/core/types/symbols';

export interface BlogPost extends
  TimestampedTrait,
  AuditableTrait,
  BlogPostExtensionSignature
{
  readonly [Type]: 'blog-post';
  readonly title: string | null;
  readonly body: string | null;
  readonly published: boolean | null;
  readonly author: User | null;
  readonly comments: AsyncHasMany<Comment>;
}

// extensions/blog-post.ts
import type { BlogPost } from '../resources/blog-post.schema.types';

export interface BlogPostExtension extends BlogPost {}

export class BlogPostExtension {
  get excerpt(): string {
    return this.body?.substring(0, 100) + '...';
  }

  async publish(): Promise<void> {
    this.published = true;
    await this.save();
  }
}

export type BlogPostExtensionSignature = typeof BlogPostExtension;
```

## Testing Strategy

The codemod includes comprehensive test coverage:

1. **Unit Tests**: Individual transformation functions
2. **Integration Tests**: End-to-end batch processing
3. **Fixture Tests**: Real-world examples
4. **Edge Cases**: Error handling, circular deps, etc.

## Performance Considerations

1. **File Caching**: Source files read once and cached
2. **Parallel Processing**: Independent models processed concurrently
3. **Dependency Ordering**: Minimizes re-processing
4. **Selective Processing**: Skip already-processed files with `skipProcessed`

## Limitations

1. **Dynamic Imports**: Cannot analyze computed import paths
2. **Complex Mixins**: Nested object structures may not transform perfectly
3. **Runtime Logic**: Cannot migrate logic that depends on EmberData internals
4. **Custom Decorators**: Only official EmberData decorators are recognized

## Migration Checklist

When using this codemod:

1. ✅ Configure input/output directories
2. ✅ Set up intermediate model paths
3. ✅ Configure import paths
4. ✅ Run in `dryRun` mode first
5. ✅ Review generated artifacts
6. ✅ Run tests
7. ✅ Update imports in other files
8. ✅ Remove old model/mixin files
