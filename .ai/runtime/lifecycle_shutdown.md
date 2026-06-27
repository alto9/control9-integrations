# Lifecycle And Shutdown

This doc describes cancellation, completion, rerun, retry, cleanup, and terminal-state behavior.

## Contract

- The integration runs inside customer CI/CD runners without taking over execution.
- It starts in shadow mode for first installs and supports enforce mode when protected paths are configured.
