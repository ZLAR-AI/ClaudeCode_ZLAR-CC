# Contributing to ZLAR-CC

Thank you for your interest in contributing to ZLAR-CC.

---

## How to Contribute

### Reporting Issues

If you find a bug, a gap in documentation, or have a suggestion, open an issue. Be specific — include what you expected, what happened, and steps to reproduce if applicable.

### Security Disclosures

If you discover a security vulnerability in ZLAR-CC, **do not open a public issue.** Use [GitHub's private vulnerability reporting](https://github.com/ZLAR-AI/ZLAR-CC/security/advisories) instead. See [SECURITY.md](SECURITY.md) for our full disclosure policy.

### Pull Requests

1. Fork the repository
2. Create a branch from `main` for your change
3. Make focused changes — one concern per PR
4. Run `npm run build` and confirm it succeeds
5. Write a clear description of what the change does and why
6. Submit the PR

We review PRs for correctness, security implications, and alignment with the project's architecture. PRs that affect the gate, classifier, matcher, or policy enforcement receive closer scrutiny — this is expected and intentional.

### Code Standards

ZLAR-CC's codebase is TypeScript (gateway, shared, tools) and bash (CLI tools, hook scripts). Contributions should:

- Follow existing patterns and naming conventions
- Include comments explaining *why*, not *what*
- Add or update tests for any behavioral change
- Document enforcement implications in the commit message if the change touches the gate or classifier

---

## What We're Looking For

Areas where contributions are particularly valuable:

- **Classifier coverage** — more patterns for the two-stage risk classifier, especially edge cases in Stage 1 boundedness checks
- **Policy templates** — example policies for different use cases (solo developer, team, enterprise)
- **Approval channels** — alternatives to Telegram (Slack, Discord, email, native desktop notifications)
- **Test coverage** — adversarial scenarios, failure modes, race conditions in the pending store
- **Documentation** — install guides for different environments, troubleshooting, architecture explanations
- **Platform expansion** — ZLAR-CC currently targets macOS; Linux and Windows support are open areas

---

## Code of Conduct

Be respectful, be specific, be constructive. Engage with the substance of ideas, not the identity of contributors. If you disagree with an architectural decision, explain what you'd do differently and why — the design docs exist to make those conversations productive.

---

## License

By contributing to ZLAR-CC, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
