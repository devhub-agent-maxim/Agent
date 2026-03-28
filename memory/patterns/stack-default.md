# Pattern: Default Stack

TypeScript, async/await, explicit error handling, DDD bounded contexts.

- Language: TypeScript (strict mode)
- Runtime: Node.js (ES2020 target)
- Test framework: Jest + ts-jest (London School TDD — mock-first)
- Async: async/await throughout (no callbacks, minimal raw Promises)
- Errors: explicit typed error handling — never swallow errors silently
- Architecture: DDD bounded contexts, domain events for state changes
- Validation: at system boundaries only (user input, external APIs)
- Config: dotenv, never hardcoded secrets
