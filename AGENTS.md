# AGENTS.md - AI Agent Coordination

**⚠️ IMPORTANT FOR CODEX**: Before starting any work, please read:
- `CLAUDE.md` - Project overview and development guidelines
- `.claude-context` - Current session state and recent changes

## Multi-Agent Development

This project supports both **Claude Code** and **Codex/GPT-5** working on the same codebase using feature branches.

### Agent Roles

- **Claude Code**: Complex features, architecture decisions, multi-file refactoring, documentation
- **Codex/GPT-5**: Quick bug fixes, code generation, unit tests, exploratory prototyping

### Workflow

#### Starting New Work
1. **Pull latest**: `git pull origin main`
2. **Create feature branch**: `git checkout -b feature/your-feature-name`
3. **Read context files**: Check `CLAUDE.md` and `.claude-context` for current state
4. **Make changes**: Develop your feature
5. **Commit**: Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. **Create PR**: `gh pr create --base main --fill`

#### Codex-Specific Notes
- Tag commits with `AI-Agent: Codex` for tracking
- Small, focused changes work best
- Always read `.claude-context` for recent session updates
- Reference `CLAUDE.md` for project architecture

#### Claude-Specific Notes
- Update `.claude-context` after significant changes
- Document architectural decisions in `CLAUDE.md` if needed
- Tag commits with `AI-Agent: Claude` for tracking

### When to Use Which Agent

**Use Codex for:**
- Quick bug fixes
- Code generation from specifications
- Unit test writing
- Boilerplate code
- Simple refactoring

**Use Claude for:**
- Complex feature development
- Architecture design
- Multi-file refactoring
- Documentation writing
- Deep debugging

### Authentication

**Codex**: Uses OpenAI subscription (browser-based)
```bash
codex auth login  # One-time setup
codex auth status # Verify authentication
```

### Best Practices

1. **Keep branches focused**: One feature per branch
2. **Coordinate**: Check for existing PRs before starting new work
3. **Review carefully**: All AI-generated code should be reviewed
4. **Update context**: Keep `.claude-context` current after major changes

---
**Project**: seo-ads-expert
**Repository**: github.com/littlebearapps/seo-ads-expert (private)
**Branch Strategy**: Feature branches from `main`
