# ADR-001: Transaction Policy Enforcement for SQL Migration Files

## Status
**Accepted** - 2025-01-20

## Context

During v2.0 development of the Thompson Sampling budget optimizer, we encountered transaction conflicts between application-level transaction control and explicit transaction statements in SQL migration files. The migration runner wraps each migration in a transaction for atomicity, but migration files containing explicit `BEGIN`, `COMMIT`, or `ROLLBACK` statements caused conflicts.

### Problem Symptoms
- **Nested Transaction Errors**: SQLite doesn't support nested transactions
- **Incomplete Rollbacks**: Failed migrations left partial schema changes
- **Trigger Syntax Conflicts**: Legitimate `BEGIN...END` in triggers incorrectly flagged
- **Inconsistent Error Handling**: Different behavior across migration files

### Root Causes
1. **Mixed Transaction Control**: Both application and SQL files managing transactions
2. **Copy-Paste from MySQL**: Migration files copied from other databases with explicit transactions
3. **Trigger Syntax Confusion**: `BEGIN TRANSACTION` vs `BEGIN...END` trigger blocks
4. **No Policy Enforcement**: No systematic prevention of transaction violations

## Decision

**Implement comprehensive transaction policy enforcement** with the following principles:

### Core Policy
- **Application Controls All Transactions**: Migration runner exclusively manages transaction lifecycle
- **Zero Transaction Statements**: SQL migration files must never contain transaction control statements
- **Trigger Exception**: Allow `BEGIN...END` blocks only in trigger definitions
- **Automated Detection**: Policy violations detected and reported before execution
- **Automated Remediation**: Tool-assisted fixing of violations

### Implementation Strategy
1. **Transaction Policy Guard**: Systematic detection and validation
2. **Forbidden Keywords**: `BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, `RELEASE`
3. **Context-Aware Parsing**: Distinguish trigger `BEGIN...END` from transaction `BEGIN TRANSACTION`
4. **Violation Reporting**: Detailed reports with file, line, context, and severity
5. **Automated Fixing**: Comment out violations with clear markers

## Implementation Details

### TransactionPolicyGuard Class
```typescript
export class TransactionPolicyGuard {
  // Validates all migration files against transaction policy
  async validateMigrations(): Promise<TransactionPolicyResult>

  // Validates single file with line-by-line analysis
  async validateFile(filePath: string): Promise<TransactionViolation[]>

  // Fixes violations by commenting out problematic statements
  async fixMigrationFile(filePath: string, dryRun: boolean): Promise<FixResult>
}
```

### Enforcement Points
1. **Pre-Migration Validation**: Check all files before running migrations
2. **CI/CD Integration**: Automated policy validation in build pipeline
3. **Developer Tools**: CLI commands for validation and fixing
4. **Documentation**: Clear policy guidelines and examples

### Context-Aware Parsing
```typescript
private isInTriggerContext(line: string, keyword: string): boolean {
  const upperLine = line.toUpperCase();
  const upperKeyword = keyword.toUpperCase();

  // Allow BEGIN and END in trigger definitions only
  if (upperKeyword === 'BEGIN' || upperKeyword === 'END') {
    return upperLine === 'BEGIN' || upperLine === 'END' || upperLine === 'END;';
  }
  return false;
}
```

## Consequences

### Positive Outcomes
- **✅ Atomic Migrations**: Guaranteed rollback on failure prevents partial schema states
- **✅ Consistent Behavior**: Standardized transaction handling across all migrations
- **✅ Early Detection**: Policy violations caught before deployment
- **✅ Automated Remediation**: Tool-assisted fixing reduces manual effort
- **✅ Developer Safety**: Clear guidelines prevent common mistakes
- **✅ CI/CD Integration**: Automated enforcement in build pipeline

### Trade-offs
- **Additional Tooling**: Requires policy guard implementation and maintenance
- **Learning Curve**: Developers must understand transaction policy rules
- **Migration Complexity**: Some advanced scenarios may require workarounds
- **Trigger Syntax**: Careful distinction needed between transaction and trigger keywords

### Migration Strategy
1. **Immediate**: Validate all existing migration files
2. **Fix Violations**: Comment out problematic transaction statements
3. **Update Documentation**: Clear policy guidelines and examples
4. **CI Integration**: Add policy validation to build pipeline
5. **Developer Training**: Communicate policy to development team

## Monitoring and Validation

### Success Metrics
- **Zero Transaction Violations**: All migration files pass policy validation
- **Atomic Rollbacks**: Failed migrations leave database in consistent state
- **CI/CD Success**: No policy violations in build pipeline
- **Developer Adoption**: New migrations follow policy from creation

### Validation Process
1. **Pre-commit Hooks**: Validate policy before committing migration files
2. **CI/CD Pipeline**: Automated policy checking in continuous integration
3. **Regular Audits**: Periodic validation of all migration files
4. **Error Monitoring**: Track transaction-related migration failures

## Related Decisions
- **ADR-002**: Configuration Schema Validation (related architectural quality approach)
- **Future ADR**: Database Schema Evolution Strategy
- **Future ADR**: Migration Testing and Validation Framework

## References
- `src/database/transaction-policy-guard.ts` - Policy enforcement implementation
- `src/tests/schema-integration.test.ts` - Integration testing framework
- `src/database/migrations/` - Migration files following policy
- `docs/extension-apis.md` - Extension patterns documentation

---

**Decision Participants**: Claude (System Architect)
**Implementation Date**: 2025-01-20
**Review Date**: 2025-07-20 (6 months)