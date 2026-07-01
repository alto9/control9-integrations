import { Control9ActionError } from "../types";
import { runGitLabAssessment } from "./runner";

async function main(): Promise<void> {
  try {
    await runGitLabAssessment();
  } catch (error) {
    if (error instanceof Control9ActionError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`Control9 GitLab runner failed unexpectedly: ${message}`);
    process.exitCode = 1;
  }
}

void main();
