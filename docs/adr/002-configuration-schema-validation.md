# ADR-002: Configuration Schema Validation with Zod

## Status
**Accepted** - 2025-01-20

## Context

During v2.0 development of the Thompson Sampling budget optimizer, we identified significant configuration drift and type safety issues affecting system reliability and maintainability.

### Problem Symptoms
- **Runtime Configuration Errors**: Invalid configurations causing application crashes
- **Type Safety Gaps**: Configuration objects lacking compile-time validation
- **Environment Inconsistencies**: Different behavior across development, testing, and production
- **Developer Confusion**: Unclear configuration requirements and defaults
- **Legacy Compatibility**: String-based database paths mixed with object configurations

### Root Causes
1. **No Runtime Validation**: Configuration accepted without schema enforcement
2. **Weak Type Safety**: TypeScript interfaces without runtime guarantees
3. **Inconsistent Defaults**: Different default values across components
4. **Missing Documentation**: Configuration schema not clearly documented
5. **Legacy Patterns**: Mixed configuration patterns (strings vs objects)

## Decision

**Implement comprehensive configuration schema validation** using Zod for runtime type safety and schema enforcement.

### Core Principles
- **Schema-First Design**: All configurations defined through Zod schemas
- **Runtime Validation**: Parse and validate all configuration at application startup
- **Environment-Specific Defaults**: Smart defaults based on NODE_ENV
- **Legacy Compatibility**: Backward-compatible adapters for existing patterns
- **Developer Experience**: Clear error messages and documentation

### Technology Choice: Zod
- **Runtime Type Safety**: TypeScript types + runtime validation in single definition
- **Excellent Error Messages**: Detailed validation errors with paths and context
- **Transformation Support**: Parse, transform, and normalize configuration values
- **Zero Dependencies**: Lightweight with no external dependencies
- **Active Ecosystem**: Strong community support and documentation

## Implementation Details

### Configuration Schema Structure
```typescript
export const DatabaseConfigSchema = z.object({
  path: z.string().min(1, "Database path cannot be empty"),
  timeout: z.number().positive().default(30000),
  retries: z.number().nonnegative().max(5).default(3),
  enableWAL: z.boolean().default(true),
  enableForeignKeys: z.boolean().default(true),
  busyTimeout: z.number().positive().default(5000),
  cacheSize: z.number().positive().default(2000),
  pageSize: z.number().positive().default(4096),
  journalMode: z.enum(['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF']).default('WAL'),
  synchronous: z.enum(['OFF', 'NORMAL', 'FULL', 'EXTRA']).default('NORMAL'),
  mmapSize: z.number().nonnegative().default(268435456)
});
```

### Environment-Specific Defaults
```typescript
export function getEnvironmentDefaults(): Partial<Config> {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'test':
      return {
        database: { path: ':memory:', enableWAL: false },
        logging: { level: 'warn' },
        performance: { enableOptimizations: false }
      };
    case 'production':
      return {
        database: { timeout: 60000, retries: 5 },
        logging: { level: 'error' },
        performance: { enableOptimizations: true }
      };
    default: // development
      return {
        database: { enableWAL: true },
        logging: { level: 'debug' },
        performance: { enableOptimizations: false }
      };
  }
}
```

### Legacy Compatibility
```typescript
export function createDatabaseConfig(input: string | Partial<DatabaseConfig>): DatabaseConfig {
  if (typeof input === 'string') {
    console.warn('⚠️  DEPRECATED: Pass database config object instead of string path');
    return DatabaseConfigSchema.parse({ path: input });
  }
  return DatabaseConfigSchema.parse(input);
}
```

### Validation Strategy
1. **Startup Validation**: Validate all configuration at application initialization
2. **Fail Fast**: Application refuses to start with invalid configuration
3. **Clear Error Messages**: Detailed validation errors with correction guidance
4. **Environment Documentation**: Auto-generated configuration documentation

## Consequences

### Positive Outcomes
- **✅ Runtime Type Safety**: Configuration errors caught at startup, not runtime
- **✅ Environment Consistency**: Standardized defaults across all environments
- **✅ Developer Experience**: Clear configuration requirements and validation errors
- **✅ Self-Documenting**: Schema serves as living documentation
- **✅ Legacy Compatibility**: Smooth migration path for existing configurations
- **✅ Performance**: Validated configuration cached for application lifetime

### Trade-offs
- **Additional Dependency**: Zod adds ~50KB to bundle size
- **Startup Overhead**: Configuration validation adds ~5-10ms to startup time
- **Schema Maintenance**: Configuration schema must be kept in sync with requirements
- **Learning Curve**: Developers must understand Zod schema syntax

### Migration Strategy
1. **Phase 1**: Implement core configuration schemas (Database, Logging, Performance)
2. **Phase 2**: Add legacy compatibility adapters
3. **Phase 3**: Migrate existing configurations to new schema format
4. **Phase 4**: Remove legacy adapters and deprecation warnings
5. **Phase 5**: Extend schema coverage to all configuration areas

## Implementation Timeline

### Phase 1: Core Infrastructure (Completed)
- ✅ Database configuration schema with Zod validation
- ✅ Environment-specific defaults for test/development/production
- ✅ Legacy compatibility adapter for string-based database paths
- ✅ Runtime validation with clear error messages

### Phase 2: Extended Coverage (Future)
- ⏳ API configuration schemas (Google Ads, Analytics, Search Console)
- ⏳ Performance and optimization configuration
- ⏳ Logging and monitoring configuration
- ⏳ Extension and plugin configuration

### Phase 3: Advanced Features (Future)
- ⏳ Configuration hot-reloading for development
- ⏳ Configuration validation in CI/CD pipeline
- ⏳ Auto-generated configuration documentation
- ⏳ Configuration migration tools

## Monitoring and Validation

### Success Metrics
- **Zero Configuration Errors**: No runtime failures due to invalid configuration
- **Fast Startup**: Configuration validation completes within 10ms
- **Clear Error Messages**: All validation errors include correction guidance
- **Developer Adoption**: New configurations use schema-first approach

### Validation Process
1. **Unit Tests**: Comprehensive schema validation test coverage
2. **Integration Tests**: End-to-end configuration validation in test environments
3. **CI/CD Validation**: Configuration schema validation in build pipeline
4. **Documentation**: Auto-generated configuration reference documentation

## Security Considerations

### Configuration Validation
- **Input Sanitization**: All configuration values validated and sanitized
- **Path Validation**: Database paths validated for safety and accessibility
- **Environment Isolation**: Different validation rules for different environments
- **Sensitive Data**: Secure handling of API keys and credentials

### Error Handling
- **Safe Error Messages**: Validation errors don't expose sensitive information
- **Graceful Degradation**: Invalid configuration results in safe defaults where possible
- **Audit Trail**: Configuration validation results logged for security monitoring

## Related Decisions
- **ADR-001**: Transaction Policy Enforcement (related architectural quality approach)
- **Future ADR**: API Configuration Management
- **Future ADR**: Environment-Specific Configuration Strategy

## References
- `src/config/schema.ts` - Configuration schema implementation
- `src/tests/config-validation.test.ts` - Configuration validation tests
- `src/database/database-manager.ts` - Configuration usage example
- `docs/configuration.md` - Configuration documentation

---

**Decision Participants**: Claude (System Architect)
**Implementation Date**: 2025-01-20
**Review Date**: 2025-07-20 (6 months)