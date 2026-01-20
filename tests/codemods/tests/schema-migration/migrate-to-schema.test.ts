import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type MigrateOptions,
  runMigration,
} from '../../../../packages/codemods/src/schema-migration/migrate-to-schema.js';

function collectFilesSnapshot(baseDir: string, dir: string = baseDir): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = relative(baseDir, fullPath);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        result[relativePath + '/'] = "__dir__";
        Object.assign(result, collectFilesSnapshot(baseDir, fullPath));
      } else {
        result[relativePath] = "\n" + readFileSync(fullPath, 'utf-8');
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return result;
}

function collectFileStructure(baseDir: string, dir: string = baseDir): string[] {
  const result: string[] = [];

  try {
    const entries = readdirSync(dir).sort();
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = relative(baseDir, fullPath);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        result.push(relativePath + '/');
        result.push(...collectFileStructure(baseDir, fullPath));
      } else {
        result.push(relativePath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return result;
}

describe('migrate-to-schema batch operation', () => {
  let tempDir: string;
  let options: MigrateOptions;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'migrate-to-schema-test-'));

    options = {
      inputDir: tempDir,
      outputDir: join(tempDir, 'app/schemas'),
      resourcesDir: join(tempDir, 'app/data/resources'),
      traitsDir: join(tempDir, 'app/data/traits'),
      extensionsDir: join(tempDir, 'app/data/extensions'),
      modelSourceDir: join(tempDir, 'app/models'),
      mixinSourceDir: join(tempDir, 'app/mixins'),
      appImportPrefix: 'test-app',
      resourcesImport: 'test-app/data/resources',
      traitsImport: 'test-app/data/traits',
      extensionsImport: 'test-app/data/extensions',
      modelImportSource: 'test-app/models',
      mixinImportSource: 'test-app/mixins',
      emberDataImportSource: '@ember-data/model',
      intermediateModelPaths: [],
      dryRun: false,
      verbose: false,
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates schema and type artifacts for models', async () => {
    const modelSource = `
import Model, { attr, belongsTo } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
  @attr('string') email;
  @belongsTo('company', { async: false }) company;

  // Extension property
  get displayName() {
    return this.name || this.email;
  }
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'user.ts'), modelSource);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('generated file structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('generated files');
  });

  it('skips mixin processing when no model-connected mixins are found', async () => {
    const mixinSource = `
import Mixin from '@ember/object/mixin';

export default Mixin.create({
  commonMethod() {
    return 'common behavior';
  }
});
`;

    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(mixinsDir, { recursive: true });
    writeFileSync(join(mixinsDir, 'unused.ts'), mixinSource);

    await runMigration(options);

    const traitsDir = join(tempDir, 'app/data/traits');
    expect(collectFileStructure(traitsDir)).toMatchSnapshot('traits directory structure');
  });

  it('generates multiple artifacts when processing multiple files', async () => {
    const user = `
import Model, { attr } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
  @attr('string') email;
}
`;

    const company = `
import Model, { attr, hasMany } from '@ember-data/model';

export default class Company extends Model {
  @attr('string') name;
  @hasMany('user', { async: false, inverse: 'company' }) users;

  get userCount() {
    return this.users.length;
  }
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'user.ts'), user);
    writeFileSync(join(modelsDir, 'company.ts'), company);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('generated file structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('generated files');
  });

  it('respects dryRun option and does not create files', async () => {
    const modelSource = `
import Model, { attr } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'user.ts'), modelSource);

    const dryRunOptions: MigrateOptions = { ...options, dryRun: true };
    await runMigration(dryRunOptions);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('dryRun file structure');
  });

  it('creates output directories if they do not exist', async () => {
    const modelSource = `
import Model, { attr } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;

  get displayName() {
    return this.name;
  }
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'user.ts'), modelSource);

    const resourcesDirBefore = collectFileStructure(join(tempDir, 'app/data/resources'));
    const extensionsDirBefore = collectFileStructure(join(tempDir, 'app/data/extensions'));
    expect(resourcesDirBefore).toEqual([]);
    expect(extensionsDirBefore).toEqual([]);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('generated file structure');
  });

  it('respects models-only and mixins-only options', async () => {
    const modelSource = `
import Model, { attr } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
}
`;

    const mixinSource = `
import Mixin from '@ember/object/mixin';

export default Mixin.create({
  commonMethod() {}
});
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(mixinsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'user.ts'), modelSource);
    writeFileSync(join(mixinsDir, 'common.ts'), mixinSource);

    const modelsOnlyOptions: MigrateOptions = { ...options, modelsOnly: true };
    await runMigration(modelsOnlyOptions);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('models-only file structure');
  });

  it('ensures schema files match source extension and type files are always .ts', async () => {
    const jsModelSource = `
import Model, { attr } from '@ember-data/model';

export default class JsModel extends Model {
  @attr('string') name;
}
`;

    const tsModelSource = `
import Model, { attr } from '@ember-data/model';

export default class TsModel extends Model {
  @attr('string') name;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'js-model.js'), jsModelSource);
    writeFileSync(join(modelsDir, 'ts-model.ts'), tsModelSource);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('mixed extensions file structure');
  });

  it('colocates type files with their corresponding schemas and traits', async () => {
    const nestedModelSource = `
import Model, { attr } from '@ember-data/model';

export default class NestedModel extends Model {
  @attr('string') name;
}
`;

    const connectedMixinSource = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  commonField: attr('string')
});
`;

    const modelUsingMixin = `
import Model, { attr } from '@ember-data/model';
import ConnectedMixin from '../../mixins/admin/connected';

export default class AdminModel extends Model.extend(ConnectedMixin) {
  @attr('string') adminName;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(join(modelsDir, 'admin'), { recursive: true });
    mkdirSync(join(mixinsDir, 'admin'), { recursive: true });

    writeFileSync(join(modelsDir, 'admin/nested-model.ts'), nestedModelSource);
    writeFileSync(join(mixinsDir, 'admin/connected.ts'), connectedMixinSource);
    writeFileSync(join(modelsDir, 'admin/admin-model.ts'), modelUsingMixin);

    await runMigration({ ...options, verbose: true });

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('nested directory structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('nested directory files');
  });

  it('does not put type files in the default fallback directory', async () => {
    const modelSource = `
import Model, { attr } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'user.ts'), modelSource);

    await runMigration(options);

    const appDir = join(tempDir, 'app');
    expect(collectFileStructure(appDir)).toMatchSnapshot('app directory structure');
  });

  it('handles external mixin imports from additionalMixinSources', async () => {
    const modelWithExternalMixin = `
import Model, { attr } from '@ember-data/model';
import ExternalMixin from '@external/mixins/external-mixin';
import LocalMixin from '../mixins/local-mixin';

export default class TestModel extends Model.extend(ExternalMixin, LocalMixin) {
  @attr('string') name;
}
`;

    const localMixin = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  localField: attr('string')
});
`;

    const externalMixin = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  externalField: attr('string')
});
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(mixinsDir, { recursive: true });

    writeFileSync(join(modelsDir, 'test-model.ts'), modelWithExternalMixin);
    writeFileSync(join(mixinsDir, 'local-mixin.ts'), localMixin);

    const externalMixinsDir = join(tempDir, 'external/mixins');
    mkdirSync(externalMixinsDir, { recursive: true });
    writeFileSync(join(externalMixinsDir, 'external-mixin.ts'), externalMixin);

    const optionsWithExternal: MigrateOptions = {
      ...options,
      additionalMixinSources: [
        {
          pattern: '@external/mixins/*',
          dir: join(tempDir, 'external/mixins/*'),
        },
      ],
    };

    await runMigration(optionsWithExternal);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('external mixins file structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('external mixins files');
  });

  it('handles mixed js and ts files correctly with proper type file extensions', async () => {
    const jsModel = `
import Model, { attr } from '@ember-data/model';
import JsMixin from '../mixins/js-mixin';

export default class JsModelWithMixin extends Model.extend(JsMixin) {
  @attr('string') name;

  get displayName() {
    return this.name + ' (JS)';
  }
}
`;

    const tsMixin = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  isEnabled: attr('boolean'),

  toggleEnabled() {
    this.set('isEnabled', !this.isEnabled);
  }
});
`;

    const jsMixin = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  createdAt: attr('date')
});
`;

    const tsModel = `
import Model, { attr } from '@ember-data/model';
import TsMixin from '../mixins/ts-mixin';

export default class TsModelWithMixin extends Model.extend(TsMixin) {
  @attr('string') title;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(mixinsDir, { recursive: true });

    writeFileSync(join(modelsDir, 'js-model-with-mixin.js'), jsModel);
    writeFileSync(join(modelsDir, 'ts-model-with-mixin.ts'), tsModel);
    writeFileSync(join(mixinsDir, 'js-mixin.js'), jsMixin);
    writeFileSync(join(mixinsDir, 'ts-mixin.ts'), tsMixin);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('mixed js/ts file structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('mixed js/ts files');
  });

  it('processes intermediateModelPaths to generate traits from base model classes', async () => {
    const dataFieldModel = `
import BaseModel from './base-model';
import BaseModelMixin from '@external/mixins/base-model-mixin';
import { attr } from '@ember-data/model';

/**
 * Data fields are used to represent information that can be selected via a
 * select list in the UI.
 */
export default class DataFieldModel extends BaseModel.extend(BaseModelMixin) {
  @attr('string') name;
  @attr('number') sortOrder;
}
`;

    const baseModel = `
import Model from '@ember-data/model';

export default class BaseModel extends Model {
}
`;

    const optionModel = `
import DataFieldModel from '../core/data-field-model';

export default class CustomSelectOption extends DataFieldModel {
}
`;

    const externalMixin = `
import Mixin from '@ember/object/mixin';

export default Mixin.create({
  // Base model functionality
});
`;

    const coreDir = join(tempDir, 'app/core');
    const modelsDir = join(tempDir, 'app/models');
    const externalMixinsDir = join(tempDir, 'external/mixins');
    mkdirSync(coreDir, { recursive: true });
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(externalMixinsDir, { recursive: true });

    writeFileSync(join(coreDir, 'data-field-model.ts'), dataFieldModel);
    writeFileSync(join(coreDir, 'base-model.ts'), baseModel);
    writeFileSync(join(modelsDir, 'custom-select-option.js'), optionModel);
    writeFileSync(join(externalMixinsDir, 'base-model-mixin.js'), externalMixin);

    const testOptions: MigrateOptions = {
      ...options,
      intermediateModelPaths: ['soxhub-client/core/base-model', 'soxhub-client/core/data-field-model'],
      additionalModelSources: [
        {
          pattern: 'soxhub-client/core/*',
          dir: join(tempDir, 'app/core/*'),
        },
      ],
      additionalMixinSources: [
        {
          pattern: '@external/mixins/*',
          dir: join(tempDir, 'external/mixins/*'),
        },
      ],
    };

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await runMigration(testOptions);
    } finally {
      // Restore original working directory
      process.chdir(originalCwd);
    }

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('intermediate models file structure');

    const traitsDir = join(tempDir, 'app/data/traits');
    expect(collectFilesSnapshot(traitsDir)).toMatchSnapshot('intermediate models traits');

    const resourcesDir = join(tempDir, 'app/data/resources');
    expect(collectFilesSnapshot(resourcesDir)).toMatchSnapshot('intermediate models resources');
  });

  it('places intermediate model extensions in extensionsDir not fallback directory', async () => {
    const intermediateModelWithMethods = `
import Model, { attr } from '@ember-data/model';

export default class BaseModelWithMethods extends Model {
  @attr('string') baseField;

  // This should create an extension artifact
  get computedValue() {
    return this.baseField + ' computed';
  }

  someMethod() {
    return 'from base model';
  }
}
`;

    const regularModel = `
import BaseModelWithMethods from '../core/base-model-with-methods';

export default class RegularModel extends BaseModelWithMethods {
}
`;

    const coreDir = join(tempDir, 'app/core');
    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(coreDir, { recursive: true });
    mkdirSync(modelsDir, { recursive: true });

    writeFileSync(join(coreDir, 'base-model-with-methods.js'), intermediateModelWithMethods);
    writeFileSync(join(modelsDir, 'regular-model.ts'), regularModel);

    const testOptions: MigrateOptions = {
      ...options,
      intermediateModelPaths: ['soxhub-client/core/base-model-with-methods'],
      additionalModelSources: [
        {
          pattern: 'soxhub-client/core/*',
          dir: join(tempDir, 'app/core/*'),
        },
      ],
    };

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await runMigration(testOptions);
    } finally {
      // Restore original working directory
      process.chdir(originalCwd);
    }

    const appDir = join(tempDir, 'app');
    expect(collectFileStructure(appDir)).toMatchSnapshot('intermediate model extensions app structure');

    const dataDir = join(tempDir, 'app/data');
    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('intermediate model extensions files');
  });

  it('ensures resources and traits include .schema with matching suffixes', async () => {
    const jsModel = `
import Model, { attr } from '@ember-data/model';
import TestMixin from '../mixins/test-mixin';

export default class JsTestModel extends Model.extend(TestMixin) {
  @attr('string') name;

  get displayName() {
    return 'JS: ' + this.name;
  }
}
`;

    const tsMixin = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  testField: attr('boolean'),

  testMethod() {
    return 'test';
  }
});
`;

    const tsModel = `
import Model, { attr } from '@ember-data/model';

export default class TsTestModel extends Model {
  @attr('string') title;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(mixinsDir, { recursive: true });

    writeFileSync(join(modelsDir, 'js-test-model.js'), jsModel);
    writeFileSync(join(modelsDir, 'ts-test-model.ts'), tsModel);
    writeFileSync(join(mixinsDir, 'test-mixin.ts'), tsMixin);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('schema naming file structure');
  });

  it('dynamically detects traits vs resources for import paths', async () => {
    const modelWithBothTypes = `
import Model, { belongsTo } from '@ember-data/model';
import WorkstreamableMixin from '../mixins/workstreamable';

export default class TestModel extends Model.extend(WorkstreamableMixin) {
  // This should be imported from resources (regular model)
  @belongsTo('user', { async: false }) user;

  // This should be imported from traits (exists as trait)
  @belongsTo('workstreamable', { async: false }) workstreamable;
}
`;

    const userModel = `
import Model, { attr } from '@ember-data/model';

export default class User extends Model {
  @attr('string') name;
}
`;

    const workstreamableMixin = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  workstreamType: attr('string')
});
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(mixinsDir, { recursive: true });

    writeFileSync(join(modelsDir, 'test-model.ts'), modelWithBothTypes);
    writeFileSync(join(modelsDir, 'user.ts'), userModel);
    writeFileSync(join(mixinsDir, 'workstreamable.ts'), workstreamableMixin);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('traits vs resources file structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('traits vs resources files');
  });

  it('ensures type files are always .ts regardless of source file extension', async () => {
    const jsModelSource = `
import Model, { attr } from '@ember-data/model';

export default class JsModel extends Model {
  @attr('string') name;
}
`;

    const tsModelSource = `
import Model, { attr } from '@ember-data/model';

export default class TsModel extends Model {
  @attr('string') name;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    mkdirSync(modelsDir, { recursive: true });
    writeFileSync(join(modelsDir, 'js-model.js'), jsModelSource);
    writeFileSync(join(modelsDir, 'ts-model.ts'), tsModelSource);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('type files extension structure');
  });

  it('detects mixins referenced via type-only imports', async () => {
    const mixinSource = `
import Mixin from '@ember/object/mixin';
import { attr } from '@ember-data/model';

export default Mixin.create({
  auditStatus: attr('string'),
  auditDate: attr('date')
});
`;

    // Create a model that uses the mixin via type-only import
    // This pattern is used when models have runtime mixin usage elsewhere
    // but need the type for declarations
    const modelWithTypeImport = `
import Model, { attr, belongsTo } from '@ember-data/model';
import type AuditableMixin from '../mixins/auditable';

export default class AuditedRecord extends Model {
  @attr('string') name;
  @belongsTo('user', { async: false }) user;
}
`;

    // Create a model that uses the mixin directly (for comparison)
    const modelWithDirectUse = `
import Model, { attr } from '@ember-data/model';
import AuditableMixin from '../mixins/auditable';

export default class AuditLog extends Model.extend(AuditableMixin) {
  @attr('string') action;
}
`;

    const modelsDir = join(tempDir, 'app/models');
    const mixinsDir = join(tempDir, 'app/mixins');
    mkdirSync(modelsDir, { recursive: true });
    mkdirSync(mixinsDir, { recursive: true });

    writeFileSync(join(mixinsDir, 'auditable.ts'), mixinSource);
    writeFileSync(join(modelsDir, 'audited-record.ts'), modelWithTypeImport);
    writeFileSync(join(modelsDir, 'audit-log.ts'), modelWithDirectUse);

    await runMigration(options);

    const dataDir = join(tempDir, 'app/data');
    expect(collectFileStructure(dataDir)).toMatchSnapshot('type-only import file structure');

    expect(collectFilesSnapshot(dataDir)).toMatchSnapshot('type-only import files');
  });
});

