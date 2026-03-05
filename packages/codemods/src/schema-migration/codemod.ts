import { existsSync, mkdirSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { glob } from 'glob';
import { basename, extname, join, resolve } from 'path';

import type { InstanciatedLogger } from '../../utils/logger.js';
import type { FinalOptions } from './config.js';
import { analyzeModelMixinUsage } from './processors/mixin-analyzer.js';
import {
  generateIntermediateModelTraitArtifacts,
  resolveIntermediateImportPath,
} from './processors/model.js';
import type { SchemaArtifactRegistry } from './utils/artifact.js';
import { buildEntityRegistry, linkEntities } from './utils/artifact.js';
import type { TransformArtifact } from './utils/ast-utils.js';
import type { ParsedFile } from './utils/file-parser.js';
import { parseFile } from './utils/file-parser.js';
import {
  FILE_EXTENSION_REGEX,
  MODEL_NAME_SUFFIX_REGEX,
  TRAILING_SINGLE_WILDCARD_REGEX,
  TRAILING_WILDCARD_REGEX,
  pascalToKebab,
} from './utils/string.js';

export type Filename = string;
export type InputFile = { path: string; code: string };

export type SkipReason =
  | 'dts-file'
  | 'file-not-found'
  | 'already-processed'
  | 'intermediate-model'
  | 'parse-error'
  | 'invalid-model'
  | 'not-mixin-file-type'
  | 'mixin-not-connected'
  | 'empty-artifacts';

export interface SkippedFile {
  file: string;
  reason: SkipReason;
  phase: 'discovery' | 'parsing' | 'generation';
}

export interface TransformerResult {
  artifacts: TransformArtifact[];
  skipReason?: SkipReason;
}

/**
 * Check if a file path matches any intermediate model path
 * Uses importSubstitutes (which includes merged intermediateModelPaths)
 */
function isIntermediateModel(
  filePath: string,
  importSubstitutes?: Array<{ import: string; extension?: string; trait?: string; sourcePath?: string }>,
  additionalModelSources?: Array<{ pattern: string; dir: string }>
): boolean {
  if (!importSubstitutes || importSubstitutes.length === 0) return false;

  const fileBaseName = basename(filePath, extname(filePath));

  for (const substitute of importSubstitutes) {
    // Handle paths with extensions (e.g., "my-app/core/base-model.js")
    const intermediateBaseName = basename(substitute.import, extname(substitute.import));

    if (fileBaseName === intermediateBaseName) {
      // Check if file is from a matching additional source
      if (additionalModelSources) {
        for (const source of additionalModelSources) {
          const sourceDirResolved = resolve(source.dir.replace(TRAILING_WILDCARD_REGEX, ''));
          if (filePath.startsWith(sourceDirResolved)) {
            return true;
          }
        }
      }

      // Also check if it's in app/core
      if (filePath.includes('/app/core/')) {
        return true;
      }
    }
  }

  return false;
}

function expandGlobPattern(dir: string): string {
  // Convert dir pattern to glob pattern (e.g., "path/to/models/*" -> "path/to/models/**/*.{js,ts}")
  let dirGlobPattern = dir;
  if (dirGlobPattern.endsWith('*')) {
    // Replace trailing * with **/*.{js,ts}
    dirGlobPattern = dirGlobPattern.replace(TRAILING_SINGLE_WILDCARD_REGEX, '**/*.{js,ts}');
  } else {
    // Add **/*.{js,ts} if no glob pattern
    dirGlobPattern = join(dirGlobPattern, '**/*.{js,ts}');
  }

  return resolve(dirGlobPattern);
}

async function findFiles(
  sources: string[],
  predicate: (file: string) => SkipReason | null,
  finalOptions: FinalOptions,
  logger: InstanciatedLogger
): Promise<{ output: InputFile[]; skipped: SkippedFile[]; errors: Error[] }> {
  const output: InputFile[] = [];
  const errors: Error[] = [];
  const skipped: SkippedFile[] = [];

  for (const source of sources) {
    try {
      const files = await glob(source);

      for (const file of files) {
        const skipReason = predicate(file);
        if (skipReason === null) {
          const content = await readFile(file, 'utf-8');

          output.push({ path: file, code: content });
        } else {
          skipped.push({ file, reason: skipReason, phase: 'discovery' });
        }
      }

      if (finalOptions.verbose) {
        logger.info(
          `📋 Found ${output.length} files at '${source}' (Total: '${output.length}', Skipped: '${skipped.length}' Sources: '[${sources.join(',')}]')`
        );
      }
    } catch (error: unknown) {
      logger.error(`Failed to process file source ${source}: ${String(error)}`);
      errors.push(error as Error);
    }
  }

  return { output, skipped, errors };
}

export class Input {
  models: Map<Filename, InputFile> = new Map();
  mixins: Map<Filename, InputFile> = new Map();
  parsedModels: Map<Filename, ParsedFile> = new Map();
  parsedMixins: Map<Filename, ParsedFile> = new Map();
  skipped: SkippedFile[] = [];
  errors: Error[] = [];
}

export class Codemod {
  logger: InstanciatedLogger;
  finalOptions: FinalOptions;
  input: Input = new Input();
  entityRegistry: SchemaArtifactRegistry = new Map();

  mixinsImportedByModels: Set<string> = new Set();
  modelsWithExtensions: Set<string> = new Set();
  resolvedSubstituteSourcePaths: Set<string> = new Set();

  constructor(logger: InstanciatedLogger, finalOptions: FinalOptions) {
    this.logger = logger;
    this.finalOptions = finalOptions;
  }

  findMixinsUsedByModels() {
    const result = analyzeModelMixinUsage(this, this.finalOptions);
    linkEntities(this.entityRegistry, result.modelToMixinsMap);
  }

  parseAllFiles() {
    this.logger.info(`🔄 Parsing all files into intermediate structure...`);

    let modelsParsed = 0;
    let mixinsParsed = 0;

    for (const [filePath, inputFile] of this.input.models) {
      try {
        const parsed = parseFile(filePath, inputFile.code, this.finalOptions);
        this.input.parsedModels.set(filePath, parsed);
        modelsParsed++;
      } catch (error) {
        this.logger.error(`❌ Error parsing model ${filePath}: ${String(error)}`);
        this.input.skipped.push({ file: filePath, reason: 'parse-error', phase: 'parsing' });
      }
    }

    for (const [filePath, inputFile] of this.input.mixins) {
      try {
        const parsed = parseFile(filePath, inputFile.code, this.finalOptions);
        this.input.parsedMixins.set(filePath, parsed);
        mixinsParsed++;
      } catch (error) {
        this.logger.error(`❌ Error parsing mixin ${filePath}: ${String(error)}`);
        this.input.skipped.push({ file: filePath, reason: 'parse-error', phase: 'parsing' });
      }
    }

    const parseErrors = this.input.skipped.filter((s) => s.reason === 'parse-error').length;
    this.logger.info(`✅ Parsed ${modelsParsed} models and ${mixinsParsed} mixins (${parseErrors} errors).`);

    this.entityRegistry = buildEntityRegistry(this.input.parsedModels, this.input.parsedMixins);
  }

  createDestinationDirectories() {
    // Only create specific directories if they are configured
    // The generic outputDir is only used for fallback artifacts and shouldn't be pre-created
    if (this.finalOptions.traitsDir) {
      mkdirSync(resolve(this.finalOptions.traitsDir), { recursive: true });
    }
    // extensions are now co-located with their schemas
    // in resourcesDir (for resource-extension) and traitsDir (for trait-extension)
    if (this.finalOptions.resourcesDir) {
      mkdirSync(resolve(this.finalOptions.resourcesDir), { recursive: true });
    }
  }

  resolveImportSubstitutes(): TransformArtifact[] {
    const substitutes = this.finalOptions.importSubstitutes;
    if (!substitutes) return [];

    const allArtifacts: TransformArtifact[] = [];

    const needsResolution: typeof substitutes = [];

    for (const substitute of substitutes) {
      let filePath: string | null = null;
      let source: string | null = null;

      if (substitute.sourcePath) {
        // Resolve via explicit sourcePath
        const candidates = [substitute.sourcePath, `${substitute.sourcePath}.ts`, `${substitute.sourcePath}.js`];
        for (const candidate of candidates) {
          if (existsSync(candidate)) {
            try {
              filePath = candidate;
              source = readFileSync(candidate, 'utf-8');
              break;
            } catch {
              // continue trying next candidate
            }
          }
        }
        if (!filePath || !source) {
          this.logger.warn(
            `Could not find source file for importSubstitute '${substitute.import}' at '${substitute.sourcePath}', falling back to static config`
          );
          this.applyDefaultSubstituteNames(substitute);
          continue;
        }
      } else {
        // Resolve via additionalModelSources/additionalMixinSources patterns
        const resolvedPath = resolveIntermediateImportPath(
          substitute.import,
          this.finalOptions.additionalModelSources,
          this.finalOptions.additionalMixinSources
        );
        const possiblePaths = [`${resolvedPath}.ts`, `${resolvedPath}.js`];
        for (const possiblePath of possiblePaths) {
          try {
            if (existsSync(possiblePath)) {
              filePath = possiblePath;
              source = readFileSync(possiblePath, 'utf-8');
              break;
            }
          } catch {
            // continue trying next candidate
          }
        }
        if (!filePath || !source) {
          this.logger.warn(`Could not find file for import substitute: ${substitute.import}`);
          this.applyDefaultSubstituteNames(substitute);
          continue;
        }
      }

      this.resolvedSubstituteSourcePaths.add(filePath);
      needsResolution.push(substitute);
    }

    // Build dependency map for topological ordering
    const modelInfoMap = new Map<
      string,
      { substitute: (typeof substitutes)[0]; filePath: string; source: string; dependencies: string[]; processed: boolean }
    >();

    for (const substitute of needsResolution) {
      const filePath = [...this.resolvedSubstituteSourcePaths].find((p) => {
        const resolvedPath = resolveIntermediateImportPath(
          substitute.import,
          this.finalOptions.additionalModelSources,
          this.finalOptions.additionalMixinSources
        );
        return p.startsWith(resolvedPath) || (substitute.sourcePath && p.startsWith(substitute.sourcePath));
      });
      if (!filePath) continue;

      const source = readFileSync(filePath, 'utf-8');
      const dependencies: string[] = [];
      for (const other of needsResolution) {
        if (other.import !== substitute.import && source.includes(`from '${other.import}'`)) {
          dependencies.push(other.import);
        }
      }

      modelInfoMap.set(substitute.import, { substitute, filePath, source, dependencies, processed: false });
    }

    // Process in dependency order (topological sort)
    const processEntry = (importPath: string): void => {
      const info = modelInfoMap.get(importPath);
      if (!info || info.processed) return;

      for (const dep of info.dependencies) {
        processEntry(dep);
      }

      try {
        const artifacts = generateIntermediateModelTraitArtifacts(
          info.filePath,
          info.source,
          importPath,
          this.finalOptions
        );

        if (artifacts.length > 0) {
          const traitArtifact = artifacts.find((a) => a.type === 'trait');
          if (traitArtifact && !info.substitute.trait) {
            info.substitute.trait = traitArtifact.baseName;
          }
          const extensionArtifact = artifacts.find((a) => a.type === 'trait-extension');
          if (extensionArtifact && !info.substitute.extension) {
            info.substitute.extension = extensionArtifact.baseName;
          }

          allArtifacts.push(...artifacts);
          this.logger.info(`Generated ${artifacts.length} artifacts from importSubstitute source '${importPath}'`);
        }
      } catch (error) {
        this.logger.error(`Error resolving import substitute ${importPath}: ${String(error)}`);
      }

      info.processed = true;
    };

    for (const importPath of modelInfoMap.keys()) {
      processEntry(importPath);
    }

    return allArtifacts;
  }

  private applyDefaultSubstituteNames(substitute: NonNullable<FinalOptions['importSubstitutes']>[number]): void {
    if (!substitute.trait) {
      const baseName = substitute.import.split('/').pop()?.replace(MODEL_NAME_SUFFIX_REGEX, '') || substitute.import;
      substitute.trait = pascalToKebab(baseName);
    }
  }

  async findModels() {
    // TODO: || './app/models'
    if (!this.finalOptions.modelSourceDir) {
      throw new Error('`options.modelSourceDir` must be specified before looking for files');
    }

    const filePattern = join(resolve(this.finalOptions.modelSourceDir), '**/*.{js,ts}');
    const fileSources = [filePattern];

    if (this.finalOptions.additionalModelSources) {
      for (const source of this.finalOptions.additionalModelSources) {
        fileSources.push(expandGlobPattern(source.dir));
      }
    }

    const models = await findFiles(
      fileSources,
      (file) => {
        if (file.endsWith('.d.ts')) return 'dts-file';
        if (!existsSync(file)) return 'file-not-found';
        if (this.finalOptions.skipProcessed && isAlreadyProcessed(file)) return 'already-processed';
        if (
          isIntermediateModel(file, this.finalOptions.importSubstitutes, this.finalOptions.additionalModelSources)
        )
          return 'intermediate-model';
        if (this.resolvedSubstituteSourcePaths.has(file)) return 'already-processed';
        return null;
      },
      this.finalOptions,
      this.logger
    );

    for (const inputFile of models.output) {
      this.input.models.set(inputFile.path, inputFile);
    }
    this.input.errors.push(...models.errors);
    this.input.skipped.push(...models.skipped);
  }

  async findMixins() {
    if (!this.finalOptions.mixinSourceDir) {
      throw new Error('`options.mixinSourceDir` must be specified before looking for files');
    }

    const filePattern = join(resolve(this.finalOptions.mixinSourceDir), '**/*.{js,ts}');
    const fileSources = [filePattern];

    if (this.finalOptions.additionalMixinSources) {
      for (const source of this.finalOptions.additionalMixinSources) {
        fileSources.push(expandGlobPattern(source.dir));
      }
    }

    const models = await findFiles(
      fileSources,
      (file) => {
        if (file.endsWith('.d.ts')) return 'dts-file';
        if (!existsSync(file)) return 'file-not-found';
        if (this.finalOptions.skipProcessed && isAlreadyProcessed(file)) return 'already-processed';
        return null;
      },
      this.finalOptions,
      this.logger
    );

    for (const inputFile of models.output) {
      this.input.mixins.set(inputFile.path, inputFile);
    }

    this.input.errors.push(...models.errors);
    this.input.skipped.push(...models.skipped);
  }
}

/**
 * Check if a file has already been processed
 */
function isAlreadyProcessed(filePath: string): boolean {
  // Simple heuristic: check if a corresponding schema file exists
  const outputPath = filePath
    .replace('/models/', '/schemas/')
    .replace('/mixins/', '/traits/')
    .replace(FILE_EXTENSION_REGEX, '.ts');

  return existsSync(outputPath);
}
