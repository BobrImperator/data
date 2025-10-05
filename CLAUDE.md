# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WarpDrive is a universal data library for web applications, formerly known as EmberData. It's designed to be framework-agnostic while maintaining compatibility with Ember.js. The project is structured as a monorepo using pnpm workspaces with Turbo for build orchestration.

## Key Architecture

### Package Structure
- **Monorepo**: Uses pnpm workspaces with packages in `/packages/`, `/warp-drive-packages/`, `/tests/`, and `/tools/`
- **Two Stack Architecture**:
  - Traditional EmberData packages (`@ember-data/*`) in `/packages/`
  - Modern WarpDrive packages (`@warp-drive/*`) in `/warp-drive-packages/`
- **Custom Build System**: Vite-based builds with Turbo caching

### Core Technologies
- **TypeScript**: Primary language with strict typing
- **Babel**: Transpilation with custom plugins
- **Vite**: Build tool and dev server
- **Turbo**: Monorepo orchestration and caching
- **Glint**: Enhanced TypeScript for Glimmer templates
- **Custom Diagnostic Framework**: Testing framework (`@warp-drive/diagnostic`)

## Essential Commands

### Development
```bash
# Install dependencies (use pnpm only)
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm --filter package-name build:pkg

# Start development mode for all packages
pnpm start

# Start specific package in dev mode
pnpm --filter package-name start

# Lint all packages
pnpm lint

# Lint and fix
pnpm lint:fix

# Type checking
pnpm check:types

# Run tests (uses custom diagnostic framework)
pnpm test

# Run tests in production mode
pnpm test:production

# Run fastboot tests
pnpm test:fastboot

# Run vite tests
pnpm test:vite

# Sync packages (regenerate code, types, etc.)
pnpm sync
```

### Working with Turbo
```bash
# Run any turbo task with streaming output
turbo run task-name --log-order=stream

# Run with specific concurrency (default is high for performance)
turbo run build:pkg --concurrency=5

# Force rebuild ignoring cache
turbo run build:pkg --force

# View dependency graph
turbo run build:pkg --graph
```

## Understanding the Build System

### Package Build Process
1. **build:pkg**: Builds individual packages, outputs to `dist/`, `declarations/`, `unstable-preview-types/`
2. **Start**: Development mode with file watching and rebuilds
3. **Dependent Builds**: Uses Turbo's dependency awareness - builds automatically trigger upstream rebuilds

### Key Build Outputs
- **dist/**: Main package distribution files
- **declarations/**: TypeScript declaration files
- **addon/**: V1 addon convention files (for compatibility)
- **tsconfig.tsbuildinfo**: Incremental build information

### Environment Variables
- **NODE_ENV**: Controls production vs development builds
- **EMBER_DATA_FULL_COMPAT**: Enables full Ember Data compatibility mode
- **IS_UNPKG_BUILD**: For minified builds intended for CDN
- **WARP_DRIVE_FEATURE_OVERRIDE**: Feature flag overrides for testing

## Testing Framework

### Custom Diagnostic System
WarpDrive uses a custom testing framework built on `@warp-drive/diagnostic`:
- Tests are in `/tests/` packages
- Uses Holodeck for API mocking (`@warp-drive/holodeck`)
- No Jest/Vitest - custom test runner with its own syntax

### Test Types
- **Unit tests**: Individual package tests
- **Integration tests**: Cross-package functionality
- **FastBoot tests**: Server-side rendering tests
- **Vite tests**: Modern build tool compatibility
- **Production tests**: Release build validation

### Running Specific Tests
```bash
# Run tests for specific package
pnpm --filter tests/package-name test

# Run with specific test patterns
pnpm test -- --filter="test-name-pattern"

# Run with debugging output
DEBUG=warp-drive:* pnpm test
```

## Code Patterns and Conventions

### TypeScript Configuration
- Project references used extensively for incremental builds
- Strict TypeScript with no implicit any
- Glint for template type checking
- Custom type generation for public APIs

### Import Patterns
- Internal imports use workspace paths: `import { ... } from '@warp-drive/debug'`
- Cross-package imports follow dependency graph built by Turbo
- Avoid circular dependencies - Turbo enforces this

### Development Process
1. **Making Changes**: Always start with `pnpm build` for initial setup
2. **Development Mode**: Use `pnpm start` for active development with hot reload
3. **Type Safety**: Run `pnpm check:types` before committing
4. **Linting**: Always run `pnpm lint` and fix issues before submitting PRs

### Working with Experimental Features
- Feature flags controlled via `WARP_DRIVE_FEATURE_OVERRIDE`
- Experimental packages have different build configurations
- Canary builds may include experimental features

## Debugging Tips

### Common Issues
1. **Build Failures**: Check Turbo cache with `turbo run build:pkg --force`
2. **Type Errors**: Incremental builds can get stale - delete `tsconfig.tsbuildinfo` files
3. **Test Failures**: Use `DEBUG=warp-drive:*` for verbose test output
4. **Dependency Issues**: Run `pnpm sync` to regenerate package dependencies

### Development Tools
- **Holodeck**: API mocking system for tests
- **Diagnostic**: Custom test runner with assertion library
- **Glint**: Template type checking
- **Turbo Devtools**: Available via `--graph` flag

## Release Channels

Understand the different build channels when working with this codebase:
- **Canary**: Latest development, potentially unstable
- **Beta**: Pre-release stabilization
- **Stable**: Production releases
- **LTS**: Long-term support releases
- **V4-Canary**: Special v4 compatibility builds

The version matrix in the README shows which Ember versions are supported by each channel.