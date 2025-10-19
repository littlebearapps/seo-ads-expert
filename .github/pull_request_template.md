# Pull Request Description Standards

**Purpose**: Define standard PR description format for all projects
**Version**: 1.0.0 (2025-10-18)
**Status**: ✅ Production Ready
**Change**: Removes Claude Code attribution

---

## Standard PR Template

```markdown
## Summary
Brief description of changes (1-3 sentences)

## Changes
- Bullet list of key changes
- Keep concise, link to issues if needed
- Focus on user-visible changes or important technical changes

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] No regressions found

## Checklist
- [ ] Code follows project style guidelines
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or documented)
- [ ] Commits follow conventional format

## Related Issues
Closes #42
Related to #38
```

---

## Section Breakdown

### 1. Summary

**Purpose**: Quick overview of what this PR does

**Format**:
- 1-3 sentences
- Explain the "what" and "why"
- High-level description suitable for changelog

**Good Examples**:
✅ "Adds user authentication using JWT tokens. Replaces basic auth with OAuth 2.0 for improved security and SSO support."

✅ "Fixes button alignment issue on mobile devices. Buttons were overlapping with text on screens < 375px width."

**Bad Examples**:
❌ "Updates files" (too vague)
❌ "This PR implements a new authentication system that uses JWT tokens for stateless authentication and also adds support for SSO and refresh tokens and migrates from basic auth..." (too long, should be in Changes section)

### 2. Changes

**Purpose**: Detailed breakdown of modifications

**Format**:
- Bullet list
- Each bullet = one logical change
- Can group related changes
- Include file paths or component names if helpful

**Example**:
```markdown
## Changes
- Add JWT authentication middleware (`src/auth/jwt-middleware.ts`)
- Update login endpoint to return JWT tokens (`src/api/auth.ts`)
- Add refresh token rotation logic (`src/auth/token-refresh.ts`)
- Migrate database schema to include token table (`migrations/003-add-tokens.sql`)
- Update API documentation for new auth flow (`docs/api/authentication.md`)
- Remove basic auth middleware (`src/auth/basic-auth.ts` - deprecated)
```

### 3. Testing

**Purpose**: Demonstrate changes are validated

**Format**:
- Checklist of testing performed
- Include test types (unit, integration, manual, performance, etc.)
- Note any areas NOT tested with rationale

**Standard Checklist**:
```markdown
## Testing
- [ ] Unit tests pass (all existing + new tests)
- [ ] Integration tests pass
- [ ] Manual testing completed (describe scenarios tested)
- [ ] No regressions found (verified existing features still work)
- [ ] Performance tested (if applicable)
- [ ] Cross-browser tested (if UI changes)
- [ ] Accessibility tested (if UI changes)
```

**Example with Details**:
```markdown
## Testing
- [x] Unit tests pass (16/16 tests, 100% coverage for new code)
- [x] Integration tests pass (authentication flow end-to-end)
- [x] Manual testing completed:
  - Tested login/logout flows in Chrome, Firefox, Safari
  - Verified token refresh works correctly
  - Confirmed SSO integration with Google OAuth
- [x] No regressions found (all existing API endpoints still functional)
- [ ] Load testing pending (will complete before merge)
```

### 4. Checklist

**Purpose**: Ensure PR meets quality standards before review

**Format**:
- Checklist of quality gates
- All must be checked before requesting review
- Can add project-specific items

**Standard Checklist**:
```markdown
## Checklist
- [ ] Code follows project style guidelines (linting passes)
- [ ] Documentation updated (CLAUDE.md, README.md, inline comments if needed)
- [ ] No breaking changes (or clearly documented with migration guide)
- [ ] Commits follow conventional format (type(scope): subject)
- [ ] Tests added/updated for new functionality
- [ ] No console.log or debug statements left in code
- [ ] Environment variables documented in .env.example (if added)
```

### 5. Related Issues

**Purpose**: Link PR to tracking issues

**Format**:
- Use GitHub keywords for automatic closing
- Group by relationship type

**GitHub Keywords**:
- `Closes #123` - Closes issue when PR merges
- `Fixes #123` - Same as Closes
- `Resolves #123` - Same as Closes
- `Related to #123` - Links issue but doesn't close

**Example**:
```markdown
## Related Issues
Closes #42, #43
Fixes #100
Related to #200, #201
Part of epic #300
```

---

## Claude Code Attribution Removal

**IMPORTANT**: Do NOT include Claude Code attribution in PR descriptions

**OLD Format** (No longer use):
```markdown
## Summary
Add user authentication using JWT tokens.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**NEW Format** (Use this):
```markdown
## Summary
Add user authentication using JWT tokens. Replaces basic auth with OAuth 2.0 for improved security and SSO support.
```

**Rationale**: PRs are created by developers using tools, not by the tools themselves. The developer is responsible for the changes and authors the PR.

---

## Complete Example

```markdown
## Summary
Implement color picker with native eyedropper API support. Includes canvas fallback for browsers that don't support the native API, with graceful degradation.

## Changes
- Add EyeDropper API integration (`src/color-picker/eyedropper.ts`)
- Implement canvas-based fallback (`src/color-picker/canvas-fallback.ts`)
- Add feature detection logic (`src/color-picker/feature-detection.ts`)
- Update UI to show available picker modes (`src/components/ColorPicker.tsx`)
- Add error handling for API failures (`src/color-picker/error-handling.ts`)
- Include comprehensive tests for both modes (`tests/color-picker.test.ts`)

## Testing
- [x] Unit tests pass (24/24 tests, 100% coverage)
- [x] Integration tests pass (color picker works in both modes)
- [x] Manual testing completed:
  - Tested EyeDropper API in Chrome 95+ (works)
  - Tested canvas fallback in Firefox (works)
  - Verified error handling when API fails
- [x] No regressions found (existing color features still work)
- [x] Cross-browser tested (Chrome, Firefox, Safari, Edge)

## Checklist
- [x] Code follows project style guidelines
- [x] Documentation updated (CLAUDE.md, component docs)
- [x] No breaking changes
- [x] Commits follow conventional format
- [x] Tests added for new functionality
- [x] No console.log statements left in code

## Related Issues
Closes #42
Related to #38
Part of color picker epic #100
```

---

## git-workflow-manager Integration

**Status**: ✅ Already Compatible

**How It Works**:
- git-workflow-manager uses `gh pr create --fill`
- `--fill` flag automatically uses `.github/pull_request_template.md`
- No code changes needed in git-workflow-manager

**Setup** (Per Repository):
1. Create `.github/pull_request_template.md` in repository
2. Copy standard template from this document
3. Customize checklist items if needed (project-specific)

**Example Template File**:
```markdown
<!-- .github/pull_request_template.md -->

## Summary
<!-- Brief description of changes (1-3 sentences) -->

## Changes
<!-- Bullet list of key changes -->
-

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] No regressions found

## Checklist
- [ ] Code follows project style guidelines
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or documented)
- [ ] Commits follow conventional format

## Related Issues
<!-- Closes #, Fixes #, Related to # -->
```

---

## Repository Setup

**File Location**: `.github/pull_request_template.md` (in each repository)

**Process** (Days 6-8 Rollout):
1. Create `.github/` directory if it doesn't exist
2. Copy template from this document to `pull_request_template.md`
3. Customize checklist for project-specific requirements
4. Commit to repository
5. Test: Open new PR and verify template appears

**Verification**:
```bash
# After setup, create test PR
gh pr create --fill

# Verify template pre-fills PR description
```

---

## Customization Guidelines

### When to Customize

**Add Items**:
- Project-specific quality gates
- Required documentation updates
- Platform-specific testing requirements

**Example Additions**:
```markdown
## Checklist (Chrome Extension)
- [ ] Code follows project style guidelines
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or documented)
- [ ] Commits follow conventional format
- [ ] manifest.json updated (if permissions changed)
- [ ] Extension tested in Chrome Web Store sandbox
- [ ] Icons/images optimized
- [ ] Content Security Policy validated
```

**Remove Items**:
- Not applicable to project type
- Redundant with CI checks

### Keep Standard Core

**Don't Change**:
- Section names (Summary, Changes, Testing, Checklist, Related Issues)
- Markdown format (headers, checklists)
- GitHub keywords (Closes, Fixes, Related to)

**Rationale**: Consistency across all 8 repositories for easier review process

---

## Common Scenarios

### Scenario 1: Simple Bug Fix

```markdown
## Summary
Fix button alignment issue on mobile devices. Buttons were overlapping with text on screens < 375px width.

## Changes
- Add responsive padding to button component (`src/components/Button.tsx`)
- Update CSS media queries for mobile breakpoints (`src/styles/button.css`)

## Testing
- [x] Unit tests pass
- [x] Integration tests pass
- [x] Manual testing completed (verified on iPhone 12, Pixel 5)
- [x] No regressions found

## Checklist
- [x] Code follows project style guidelines
- [x] Documentation updated (component docs)
- [x] No breaking changes
- [x] Commits follow conventional format

## Related Issues
Fixes #123
```

### Scenario 2: New Feature (Complex)

```markdown
## Summary
Add user authentication system using JWT tokens. Replaces basic auth with OAuth 2.0 for improved security and SSO support.

## Changes
**Authentication**:
- Add JWT middleware (`src/auth/jwt-middleware.ts`)
- Implement token refresh logic (`src/auth/token-refresh.ts`)
- Add OAuth 2.0 integration (`src/auth/oauth.ts`)

**Database**:
- Create tokens table (`migrations/003-add-tokens.sql`)
- Add user sessions tracking (`migrations/004-add-sessions.sql`)

**API**:
- Update login endpoint (`src/api/auth.ts`)
- Add refresh endpoint (`src/api/refresh.ts`)
- Update authentication docs (`docs/api/authentication.md`)

**Deprecation**:
- Remove basic auth middleware (`src/auth/basic-auth.ts`)
- Add migration guide (`docs/migration/basic-to-jwt.md`)

## Testing
- [x] Unit tests pass (42/42 tests, 95% coverage)
- [x] Integration tests pass (full authentication flow)
- [x] Manual testing completed:
  - Login/logout flows (Chrome, Firefox, Safari)
  - Token refresh functionality
  - SSO with Google OAuth
  - Session management
- [x] No regressions found (all API endpoints functional)
- [x] Load tested (1000 concurrent users, <100ms response time)

## Checklist
- [x] Code follows project style guidelines
- [x] Documentation updated (API docs, migration guide, CLAUDE.md)
- [x] Breaking changes documented (see migration guide)
- [x] Commits follow conventional format
- [x] Tests added for new functionality
- [x] Environment variables documented in .env.example

## Related Issues
Closes #42, #43
Fixes #100
Related to #200
Part of authentication epic #300
```

### Scenario 3: Documentation Only

```markdown
## Summary
Update installation instructions for Windows. Previous docs only covered macOS/Linux.

## Changes
- Add Windows installation steps (`README.md`)
- Include PowerShell examples (`docs/installation/windows.md`)
- Update screenshots for Windows UI (`docs/images/`)

## Testing
- [x] Manual testing completed (followed steps on Windows 11)
- [x] No regressions found (existing docs still accurate)

## Checklist
- [x] Code follows project style guidelines (N/A)
- [x] Documentation updated (this IS the documentation update)
- [x] No breaking changes
- [x] Commits follow conventional format

## Related Issues
Closes #456
```

---

## Migration Checklist

**For Each Repository** (Days 6-8):

1. **Create Template File**
   ```bash
   mkdir -p .github
   cp ~/claude-code-tools/docs/standards/PR-TEMPLATE.md .github/pull_request_template.md
   ```

2. **Customize If Needed**
   - Add project-specific checklist items
   - Keep standard core sections

3. **Test Template**
   ```bash
   # Create test PR
   git checkout -b test/pr-template
   echo "test" > test.txt
   git add test.txt
   git commit -m "test: verify PR template"
   git push -u origin test/pr-template
   gh pr create --fill
   # Verify template appears in PR description
   ```

4. **Document in CLAUDE.md**
   - Add reference to PR template standards
   - Link to this document

5. **Update git-workflow-manager** (If Needed)
   - Verify `--fill` flag still works
   - Test PR creation workflow

---

## FAQ

**Q: Do I have to use this PR template format?**
A: Yes, for all projects adopting these standards (Initiative #4).

**Q: Can I add project-specific sections?**
A: Yes, but keep the 5 standard sections (Summary, Changes, Testing, Checklist, Related Issues).

**Q: What if my PR is very simple (1-line change)?**
A: Still use the template, but sections can be brief. Example: "Summary: Fix typo in README. Changes: - Fix typo. Testing: N/A. Checklist: [all checked]. Related Issues: N/A"

**Q: Does git-workflow-manager automatically use this template?**
A: Yes, via `gh pr create --fill`. Just create `.github/pull_request_template.md` in your repo.

**Q: What if I forget to use the template?**
A: The template will automatically appear when you create a PR via GitHub web UI or `gh pr create --fill`. If you skip it accidentally, reviewers may request updates.

---

**Version**: 1.0.0 (2025-10-18)
**Enhancement Initiative**: #4 (Git Commit/PR Standards)
**Status**: Production Ready
**Next Steps**: Deploy templates to all 8 repositories (Days 6-8)
