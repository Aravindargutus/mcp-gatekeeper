---
name: Code Review Helper
description: Use this skill to review code for bugs, security issues, and best practices. Triggers on PR reviews and code submissions.
---

# Code Review Helper

This skill helps developers review code effectively by checking for common issues.

## When to Use

Use this skill when reviewing pull requests, checking code for security vulnerabilities, or ensuring best practices are followed. It works best with TypeScript and JavaScript codebases.

## How It Works

The skill analyzes code changes and provides feedback on:

1. **Security Issues** - Identifies potential XSS, injection, and authentication vulnerabilities
2. **Code Quality** - Checks for code smells, complexity, and maintainability issues
3. **Best Practices** - Ensures coding standards and patterns are followed
4. **Performance** - Flags potential performance bottlenecks and memory leaks

## Configuration

The skill can be configured through the project's configuration file. See [references/config-options.md](references/config-options.md) for details.

## Examples

Here are some example use cases for the code review helper skill that demonstrate its capabilities across different scenarios and programming languages.

### Security Review

When reviewing authentication code, the skill will check for proper token handling, session management, and input validation. It verifies that sensitive data is not logged and that error messages do not leak internal information.

### Performance Review

For performance-critical code paths, the skill analyzes algorithmic complexity, identifies unnecessary re-renders in React components, and suggests caching strategies where appropriate.

### Code Organization

The skill checks for proper separation of concerns, consistent naming conventions, and adherence to the project's architectural patterns. It also verifies that new code follows established patterns.

## Integration

The skill integrates with popular version control systems and can be triggered automatically on pull request creation. It supports custom rule sets and can be extended with additional validators.

### Supported Languages

- TypeScript and JavaScript (primary)
- Python (experimental)
- Go (experimental)

### Custom Rules

You can define custom rules in the project configuration. Each rule specifies a pattern to match, a severity level, and a message to display when the pattern is found in code changes.

## Limitations

- Does not analyze binary files
- Maximum file size of 1MB per file
- Requires network access for dependency vulnerability checks

## Troubleshooting

If the skill is not triggering on pull requests, verify that the hook configuration is correct and that the skill has the necessary permissions to access the repository.

For more detailed troubleshooting steps, consult the references directory which contains additional documentation and common issue resolutions for various development environments and configurations.

Additional information about advanced configuration options and custom rule creation can be found in the supplementary documentation files located in the references subdirectory of this skill package.

The code review process can be customized to match your team's specific workflow requirements and coding standards. Configuration options allow you to adjust sensitivity levels, enable or disable specific rule categories, and define custom patterns for your codebase.

When working with large codebases, the skill automatically prioritizes the most critical findings and groups related issues together for easier review. This helps developers focus on the most important changes first.

The skill also supports incremental review mode, where it only analyzes changes since the last review. This is particularly useful for large pull requests that are reviewed in multiple passes.

For teams using monorepo structures, the skill can be configured to apply different rule sets to different parts of the repository. This allows for specialized review criteria based on the component or service being modified.

The integration with continuous integration pipelines allows the skill to run automatically on every commit, providing early feedback to developers before the formal code review process begins.

Advanced users can extend the skill's functionality by creating custom validators that integrate with the existing review pipeline. These validators can access the full context of the code change, including the diff, the file history, and the project configuration.

The skill maintains a history of previous reviews, allowing it to track recurring issues and suggest systematic improvements to the codebase over time. This historical analysis helps teams identify patterns in their code quality and make targeted improvements.

For organizations with specific compliance requirements, the skill can be configured to enforce regulatory standards and generate audit-ready reports of code review findings. This includes support for common frameworks such as SOC 2, HIPAA, and GDPR compliance checks.

The skill's reporting capabilities include detailed summaries of findings, trend analysis over time, and integration with popular project management tools for tracking issue resolution. Reports can be generated in multiple formats including HTML, JSON, and PDF.
