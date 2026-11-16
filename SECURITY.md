# Security Policy

## Supported versions

Security fixes are made to the latest release and to the `develop` branch.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately using GitHub's **"Report a vulnerability"** option on the repository's Security tab (private vulnerability reporting).

Include:

- a description of the issue and its impact,
- steps to reproduce, or a proof of concept,
- the affected version or commit.

We aim to acknowledge reports within 5 working days and to keep you informed as we investigate and fix the problem. Please give us reasonable time to release a fix before disclosing publicly.

## Contact

<!-- TODO(maintainers): add a monitored security contact email here, and confirm private vulnerability reporting is enabled on the GitHub repository. -->

## Scope notes

IMDirectory is a static single-page app. All `VITE_…` environment variables are compiled into the public bundle, so they must never contain secrets. Sign-in uses PKCE with Casdoor and needs no client secret. See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

Please do not include real patient or personal data in reports, issues or test fixtures.
