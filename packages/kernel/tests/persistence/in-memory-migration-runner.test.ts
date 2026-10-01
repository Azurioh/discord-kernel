import { describe, expect, it } from "vitest";
import { createInMemoryMigrationRunner } from "@/persistence/in-memory-migration-runner";
import { runMigrationRunnerContract } from "@/persistence/testing/migration-runner-contract";

runMigrationRunnerContract("in-memory", createInMemoryMigrationRunner, { describe, it, expect });
