# SmartBioTrack

A pnpm/Turborepo monorepo: NestJS API (`apps/api`) + Next.js web app (`apps/web`), backed by Postgres/PostGIS via Prisma on Neon.

## Onboarding

### 1. Prerequisites

- Node >= 18
- [pnpm](https://pnpm.io/installation) (repo is pinned to `pnpm@9.0.0`)
- Access to the shared Neon database connection string (ask a teammate — never commit it)

### 2. Clone and install

```sh
git clone https://github.com/<org>/smartbiotrack.git
cd smartbiotrack
pnpm install
```

`pnpm install` runs `postinstall` automatically, which generates the Prisma client.

### 3. Environment variables

Copy the env template and fill in the values you're given (DB URL, etc.):

```sh
cp .env.production .env
```

`.env` is gitignored — get real values from a teammate via a secrets manager, not Slack/email in plaintext.

### 4. Set up the database

```sh
npx prisma migrate dev
pnpm db:seed
```

### 5. Run the apps

```sh
pnpm dev              # runs all apps via turbo
pnpm dev --filter=api # just the NestJS API
pnpm dev --filter=web # just the Next.js web app
```

### 6. Before you start changing code

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the repo map, then skim:

- `apps/api` — NestJS backend (controllers/services/modules per feature, Prisma for data access)
- `apps/web` — Next.js frontend
- `packages/` — shared code: `@repo/ui`, `@repo/types`, `@repo/validation`, `@repo/utils`, `@repo/eslint-config`, `@repo/typescript-config`

### 7. Create a branch and open a PR

Never commit directly to `main`. For each piece of work:

```sh
git checkout main
git pull origin main
git checkout -b feat/short-description   # or fix/..., chore/..., docs/...
```

Work, commit with clear messages (this repo follows Conventional Commits: `feat:`, `fix:`, `chore:`, etc.), then:

```sh
git push -u origin feat/short-description
```

Open a pull request into `main` on GitHub, request a review, and merge only once it's approved and CI passes.

### 8. Before pushing

```sh
pnpm lint
pnpm check-types
```

## What's inside?

- `apps/api`: [NestJS](https://nestjs.com/) API, Prisma ORM, Postgres/PostGIS on Neon
- `apps/web`: [Next.js](https://nextjs.org/) app
- `@repo/ui`: shared React component library
- `@repo/types`, `@repo/validation`, `@repo/utils`: shared TypeScript code
- `@repo/eslint-config`: shared `eslint` configurations
- `@repo/typescript-config`: shared `tsconfig.json`s

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo build
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo build
pnpm dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo build --filter=docs
```

Without global `turbo`:

```sh
npx turbo build --filter=docs
pnpm exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo dev
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo dev
pnpm exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo dev --filter=web
```

Without global `turbo`:

```sh
npx turbo dev --filter=web
pnpm exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended):

```sh
cd my-turborepo
turbo login
```

Without global `turbo`, use your package manager:

```sh
cd my-turborepo
npx turbo login
pnpm exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed:

```sh
turbo link
```

Without global `turbo`:

```sh
npx turbo link
pnpm exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.dev/docs/reference/configuration)
- [CLI Usage](https://turborepo.dev/docs/reference/command-line-reference)
