# Contributing to Secure CI/CD Pipeline

Thank you for your interest in contributing! This document provides guidelines and instructions.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Report issues professionally
- Help others in the community

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch: `git checkout -b feature/your-feature`
4. Make changes
5. Test thoroughly
6. Commit with clear messages
7. Push and create Pull Request

## Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style
- `refactor`: Refactoring
- `test`: Tests
- `chore`: Build/dependencies

**Example**:
```
feat(scans): add incremental scanning support

- Implement incremental scan logic
- Reduce scan time by 30%
- Add database caching

Closes #123
```

## Pull Request Process

1. Update README.md if needed
2. Add tests for new features
3. Ensure all tests pass
4. Request review from maintainers
5. Address feedback
6. Wait for approval and merge

## Coding Standards

### JavaScript/Node.js
- Use ES6+ syntax
- Follow ESLint rules
- Use const/let (no var)
- Add JSDoc comments

### Python
- Follow PEP 8
- Use type hints where possible
- Add docstrings
- Use black for formatting

### React
- Functional components only
- Use hooks for state
- Proper prop types
- Meaningful component names

## Testing Requirements

- Minimum 80% code coverage
- All new features must have tests
- Tests must be passing
- Integration tests for API endpoints

## Documentation

- Update README for new features
- Add code comments for complex logic
- Create examples for new APIs
- Update architecture docs if needed

## Review Process

1. Automated tests run
2. Code review by maintainers
3. Feedback and discussions
4. Required changes completion
5. Approval and merge

## Reporting Issues

### Bug Report Template
```markdown
## Description
Brief description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Expected vs Actual result

## Environment
- OS: 
- Node version:
- Python version:
- Browser:

## Additional Context
Screenshots, logs, etc.
```

### Feature Request Template
```markdown
## Description
What would you like?

## Use Case
Why is this needed?

## Proposed Solution
How should it work?

## Alternatives
Other approaches considered
```

## Release Process

1. Update version number
2. Update CHANGELOG
3. Create release tag
4. Publish to npm registry
5. Announce release

## Community

- **Discord**: [Join our server]
- **Email**: dev@securecicd.dev
- **Discussions**: GitHub Discussions
- **Issues**: GitHub Issues

---

Happy contributing! 🚀
