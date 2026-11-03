import { beforeEach } from "vitest";
import { setLocale } from "../src/i18n/locale.js";

// Existing fixtures use English selectors. Production defaults to Persian;
// locale-specific tests explicitly choose the language they exercise.
beforeEach(() => setLocale("en"));
