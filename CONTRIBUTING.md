# Contributing

Use Node.js 24 or newer. Install dependencies with `npm ci` and keep `package-lock.json` updated when dependency inputs change.

Work in short-lived branches such as `feat/product-comparison` or `fix/seller-ranking`. Use concise English commit messages describing the final behavior. Open a pull request against `main`, explain the change and validation, and keep unrelated changes separate.

Never commit API keys, environment files, conversation databases, raw challenge CSV files, or local usage reports. `.env.example` contains variable names only. Large challenge files must be obtained separately from the organizer.

Run `npm test` against the complete imported challenge dataset before publishing a change. CI runs the same behavior tests on synthetic records under Linux and Windows, without API credentials or paid model calls. Full-dataset counts and relationships are validated locally; a green CI run does not imply the full dataset was tested remotely.

Deployment to Liara is intentionally separate from CI until the final environment, persistent disk and deployment credentials have been configured. Do not add secrets directly to workflow files.
