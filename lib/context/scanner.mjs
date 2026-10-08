import fs from "node:fs";
import path from "node:path";

/**
 * Ultra-fast (< 20ms) project identity and ecosystem scanner.
 * Deterministically detects project type, frameworks, databases, package managers,
 * and key dependencies across Node.js, PHP, Python, Go, and Rust without loading unnecessary code.
 *
 * @param {string} projectDir - Target root directory to scan.
 * @returns {object} Normalized project identity metadata.
 */
export function scanProjectIdentity(projectDir = process.cwd()) {
  const start = Date.now();
  const identity = {
    name: path.basename(projectDir),
    ecosystem: "unknown",
    packageManager: "unknown",
    languages: [],
    frameworks: [],
    databases: [],
    dependencies: [],
    scripts: {},
    entrypoints: [],
    isMonorepo: false,
    scanDurationMs: 0,
  };

  try {
    // 0. Monorepo & Workspace Detection
    const hasPnpmWorkspace = fs.existsSync(path.join(projectDir, "pnpm-workspace.yaml"));
    const hasLerna = fs.existsSync(path.join(projectDir, "lerna.json"));
    const hasTurbo = fs.existsSync(path.join(projectDir, "turbo.json"));
    if (hasPnpmWorkspace || hasLerna || hasTurbo) {
      identity.isMonorepo = true;
    }

    // 1. Node.js / JavaScript / TypeScript Ecosystem
    const pkgPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        identity.ecosystem = "node";
        if (pkg.name) identity.name = pkg.name;
        if (!identity.languages.includes("JavaScript")) identity.languages.push("JavaScript");

        if (pkg.workspaces) identity.isMonorepo = true;

        const tsConfig = path.join(projectDir, "tsconfig.json");
        const tsConfigApp = path.join(projectDir, "tsconfig.app.json");
        if (fs.existsSync(tsConfig) || fs.existsSync(tsConfigApp)) {
          identity.languages.push("TypeScript");
        }

        if (fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"))) identity.packageManager = "pnpm";
        else if (fs.existsSync(path.join(projectDir, "yarn.lock"))) identity.packageManager = "yarn";
        else if (fs.existsSync(path.join(projectDir, "bun.lockb")) || fs.existsSync(path.join(projectDir, "bun.lock"))) identity.packageManager = "bun";
        else if (fs.existsSync(path.join(projectDir, "package-lock.json"))) identity.packageManager = "npm";

        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
          ...(pkg.peerDependencies || {}),
        };

        identity.dependencies = Object.keys(allDeps).slice(0, 50);
        identity.scripts = pkg.scripts || {};

        if (pkg.main) identity.entrypoints.push(pkg.main);
        if (pkg.module) identity.entrypoints.push(pkg.module);
        if (pkg.bin) {
          if (typeof pkg.bin === "string") identity.entrypoints.push(pkg.bin);
          else if (typeof pkg.bin === "object") identity.entrypoints.push(...Object.values(pkg.bin));
        }

        // Framework detectors for Node
        if (allDeps.next) identity.frameworks.push("Next.js");
        if (allDeps.nuxt) identity.frameworks.push("Nuxt");
        if (allDeps.react) identity.frameworks.push("React");
        if (allDeps.vue) identity.frameworks.push("Vue");
        if (allDeps.svelte) identity.frameworks.push("Svelte");
        if (allDeps["@sveltejs/kit"]) identity.frameworks.push("SvelteKit");
        if (allDeps["@remix-run/node"] || allDeps["@remix-run/react"]) identity.frameworks.push("Remix");
        if (allDeps.astro) identity.frameworks.push("Astro");
        if (allDeps["@angular/core"]) identity.frameworks.push("Angular");
        if (allDeps.express) identity.frameworks.push("Express");
        if (allDeps.fastify) identity.frameworks.push("Fastify");
        if (allDeps["@nestjs/core"]) identity.frameworks.push("NestJS");
        if (allDeps.hono) identity.frameworks.push("Hono");
        if (allDeps.elysia) identity.frameworks.push("Elysia");
        if (allDeps["@adonisjs/core"]) identity.frameworks.push("AdonisJS");
        if (allDeps.vite) identity.frameworks.push("Vite");
        if (allDeps.tailwindcss) identity.frameworks.push("Tailwind CSS");

        // Database detectors for Node
        if (allDeps.prisma || allDeps["@prisma/client"]) identity.databases.push("Prisma ORM");
        if (allDeps.mongoose) identity.databases.push("MongoDB / Mongoose");
        if (allDeps.pg || allDeps["pg-promise"]) identity.databases.push("PostgreSQL");
        if (allDeps.mysql || allDeps.mysql2) identity.databases.push("MySQL");
        if (allDeps.sqlite3 || allDeps["better-sqlite3"]) identity.databases.push("SQLite");
        if (allDeps.drizzle || allDeps["drizzle-orm"]) identity.databases.push("Drizzle ORM");
        if (allDeps.typeorm) identity.databases.push("TypeORM");
        if (allDeps["@mikro-orm/core"]) identity.databases.push("MikroORM");
        if (allDeps.kysely) identity.databases.push("Kysely");
        if (allDeps.sequelize) identity.databases.push("Sequelize");
        if (allDeps.redis || allDeps.ioredis || allDeps["@upstash/redis"]) identity.databases.push("Redis");
        if (allDeps["@supabase/supabase-js"]) identity.databases.push("Supabase");
      } catch {}
    }

    // 2. PHP Ecosystem (Composer / Laravel / WordPress)
    const composerPath = path.join(projectDir, "composer.json");
    if (fs.existsSync(composerPath)) {
      try {
        const composer = JSON.parse(fs.readFileSync(composerPath, "utf-8"));
        if (identity.ecosystem === "unknown") identity.ecosystem = "php";
        if (!identity.languages.includes("PHP")) identity.languages.push("PHP");
        if (composer.name && identity.name === path.basename(projectDir)) identity.name = composer.name;

        const reqs = { ...(composer.require || {}), ...(composer["require-dev"] || {}) };
        if (reqs["laravel/framework"]) identity.frameworks.push("Laravel");
        if (reqs["symfony/framework-bundle"] || reqs["symfony/symfony"]) identity.frameworks.push("Symfony");
        if (reqs["livewire/livewire"]) identity.frameworks.push("Livewire");
        if (reqs["inertiajs/inertia-laravel"]) identity.frameworks.push("Inertia.js");
        if (reqs["slim/slim"]) identity.frameworks.push("Slim");
        if (reqs["codeigniter4/framework"]) identity.frameworks.push("CodeIgniter");
        if (reqs["doctrine/orm"]) identity.databases.push("Doctrine ORM");
        if (reqs["illuminate/database"]) identity.databases.push("Eloquent ORM");
      } catch {}
    }

    if (fs.existsSync(path.join(projectDir, "wp-config.php")) || fs.existsSync(path.join(projectDir, "wp-content"))) {
      if (!identity.languages.includes("PHP")) identity.languages.push("PHP");
      if (identity.ecosystem === "unknown") identity.ecosystem = "php";
      identity.frameworks.push("WordPress");
      identity.databases.push("MySQL");
    }

    // 3. Python Ecosystem (pyproject.toml / requirements.txt / Pipfile)
    const pyprojectPath = path.join(projectDir, "pyproject.toml");
    const requirementsPath = path.join(projectDir, "requirements.txt");
    const pipfilePath = path.join(projectDir, "Pipfile");
    const poetryLockPath = path.join(projectDir, "poetry.lock");

    if (fs.existsSync(pyprojectPath) || fs.existsSync(requirementsPath) || fs.existsSync(pipfilePath)) {
      if (identity.ecosystem === "unknown") identity.ecosystem = "python";
      if (!identity.languages.includes("Python")) identity.languages.push("Python");

      if (fs.existsSync(poetryLockPath)) identity.packageManager = "poetry";
      else if (fs.existsSync(pipfilePath)) identity.packageManager = "pipenv";
      else if (identity.packageManager === "unknown") identity.packageManager = "pip";

      let pyContent = "";
      if (fs.existsSync(pyprojectPath)) {
        pyContent += fs.readFileSync(pyprojectPath, "utf-8").slice(0, 16384);
      }
      if (fs.existsSync(requirementsPath)) {
        pyContent += "\n" + fs.readFileSync(requirementsPath, "utf-8").slice(0, 16384);
      }
      if (fs.existsSync(pipfilePath)) {
        pyContent += "\n" + fs.readFileSync(pipfilePath, "utf-8").slice(0, 16384);
      }

      if (/django/i.test(pyContent)) identity.frameworks.push("Django");
      if (/fastapi/i.test(pyContent)) identity.frameworks.push("FastAPI");
      if (/flask/i.test(pyContent)) identity.frameworks.push("Flask");
      if (/tornado/i.test(pyContent)) identity.frameworks.push("Tornado");
      if (/sanic/i.test(pyContent)) identity.frameworks.push("Sanic");
      if (/celery/i.test(pyContent)) identity.frameworks.push("Celery");
      if (/streamlit/i.test(pyContent)) identity.frameworks.push("Streamlit");
      if (/langchain/i.test(pyContent)) identity.frameworks.push("LangChain");

      if (/sqlalchemy/i.test(pyContent)) identity.databases.push("SQLAlchemy");
      if (/tortoise-orm/i.test(pyContent)) identity.databases.push("Tortoise ORM");
      if (/peewee/i.test(pyContent)) identity.databases.push("Peewee");
      if (/sqlmodel/i.test(pyContent)) identity.databases.push("SQLModel");
      if (/psycopg/i.test(pyContent) || /asyncpg/i.test(pyContent)) identity.databases.push("PostgreSQL");
      if (/pymongo/i.test(pyContent) || /motor/i.test(pyContent)) identity.databases.push("MongoDB");
      if (/redis/i.test(pyContent)) identity.databases.push("Redis");
    }

    // 4. Go Ecosystem (go.mod)
    const goModPath = path.join(projectDir, "go.mod");
    if (fs.existsSync(goModPath)) {
      if (identity.ecosystem === "unknown") identity.ecosystem = "go";
      if (!identity.languages.includes("Go")) identity.languages.push("Go");
      identity.packageManager = "go modules";

      const goContent = fs.readFileSync(goModPath, "utf-8").slice(0, 16384);
      if (/gin-gonic\/gin/i.test(goContent)) identity.frameworks.push("Gin");
      if (/gofiber\/fiber/i.test(goContent)) identity.frameworks.push("Fiber");
      if (/labstack\/echo/i.test(goContent)) identity.frameworks.push("Echo");
      if (/go-chi\/chi/i.test(goContent)) identity.frameworks.push("Chi");

      if (/gorm\.io\/gorm/i.test(goContent)) identity.databases.push("GORM");
      if (/jmoiron\/sqlx/i.test(goContent)) identity.databases.push("SQLx");
      if (/entgo\.io\/ent/i.test(goContent)) identity.databases.push("Ent");
      if (/jackc\/pgx/i.test(goContent)) identity.databases.push("pgx (PostgreSQL)");
    }

    // 5. Rust Ecosystem (Cargo.toml)
    const cargoPath = path.join(projectDir, "Cargo.toml");
    if (fs.existsSync(cargoPath)) {
      if (identity.ecosystem === "unknown") identity.ecosystem = "rust";
      if (!identity.languages.includes("Rust")) identity.languages.push("Rust");
      identity.packageManager = "cargo";

      const cargoContent = fs.readFileSync(cargoPath, "utf-8").slice(0, 16384);
      if (/actix-web/i.test(cargoContent)) identity.frameworks.push("Actix Web");
      if (/axum/i.test(cargoContent)) identity.frameworks.push("Axum");
      if (/rocket/i.test(cargoContent)) identity.frameworks.push("Rocket");
      if (/warp/i.test(cargoContent)) identity.frameworks.push("Warp");
      if (/tonic/i.test(cargoContent)) identity.frameworks.push("Tonic (gRPC)");

      if (/diesel/i.test(cargoContent)) identity.databases.push("Diesel ORM");
      if (/sqlx/i.test(cargoContent)) identity.databases.push("SQLx");
      if (/sea-orm/i.test(cargoContent)) identity.databases.push("SeaORM");
      if (/tokio-postgres/i.test(cargoContent)) identity.databases.push("PostgreSQL");
      if (/rusqlite/i.test(cargoContent)) identity.databases.push("SQLite");
    }
  } catch {}

  // Deduplicate
  identity.languages = [...new Set(identity.languages)];
  identity.frameworks = [...new Set(identity.frameworks)];
  identity.databases = [...new Set(identity.databases)];
  identity.entrypoints = [...new Set(identity.entrypoints)];

  identity.scanDurationMs = Date.now() - start;
  return identity;
}
