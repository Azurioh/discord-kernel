import { describe, expect, it } from "vitest";
import { createInMemorySettingsStore } from "@/settings/in-memory/in-memory-settings-store";
import { runSettingsStoreContract } from "@/settings/testing/settings-store-contract";

runSettingsStoreContract(createInMemorySettingsStore, { describe, it, expect });
