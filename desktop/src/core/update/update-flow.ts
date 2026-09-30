/**
 * What happens when a window opens and a newer build is waiting (2026-09-30).
 *
 *   newer build + no reminder in the future  ->  ask: Update now / Update later
 *   Update now    ->  start the swap helper (it waits for this app to exit), then quit
 *   Update later  ->  persist 1 hour / 4 hours / tomorrow; stay quiet until then
 *   closed prompt ->  nothing persisted; the next open asks again
 *
 * Under the test env var the prompt is recorded, never shown (Phase 12: e2e never opens a
 * dialog). Every OS-shaped step is injected, so this module is plain Node and portable.
 */

import { type Logger, describeError } from '../redact';
import { type RemindLaterChoice, decideUpdate, isRemindLaterChoice, remindAfter } from './update-check';

/** Where the *Update later* time is kept (`main/update-reminder-store.ts` on disk). */
export interface ReminderStore {
  read(): Date | null;
  write(at: Date): void;
}

export type PromptAnswer = 'update-now' | RemindLaterChoice | 'dismissed';
export type WindowOpenOutcome = 'none' | 'snoozed' | 'prompted' | 'recorded' | 'already-prompting';

export interface UpdateFlowDeps {
  readonly runningTree: string | null;
  /** The builder's `lastBuiltSha`, or `null`. May throw; a throw is "no update". */
  readonly readLastBuiltSha: () => string | null;
  readonly buildOnDisk: (tree: string) => boolean;
  readonly reminders: ReminderStore;
  readonly now: () => Date;
  readonly testMode: boolean;
  /** Show the app-owned prompt and resolve with Stack's answer. Never a native dialog. */
  readonly showPrompt: (tree: string) => Promise<PromptAnswer>;
  /** Spawn the detached swap helper; resolves once it is running. */
  readonly startUpdate: (tree: string) => Promise<void>;
  readonly quit: () => void;
  readonly record: (kind: string, payload: unknown) => void;
  readonly log: Logger;
}

export interface UpdateFlow {
  /** Call after a window has been built and shown. Never rejects. */
  onWindowOpened(): Promise<WindowOpenOutcome>;
}

export function createUpdateFlow(deps: UpdateFlowDeps): UpdateFlow {
  let prompting = false;

  const lastBuiltSha = (): string | null => {
    try {
      return deps.readLastBuiltSha();
    } catch (error) {
      deps.log.warn(`builder state unreadable; no update check this time: ${describeError(error)}`);
      return null;
    }
  };

  const act = async (tree: string, answer: PromptAnswer): Promise<void> => {
    if (answer === 'update-now') {
      try {
        await deps.startUpdate(tree);
      } catch (error) {
        deps.log.error(`Update now could not start the helper; staying on this build: ${describeError(error)}`);
        return;
      }
      deps.log.info(`Update now: helper started for build ${tree}; quitting so it can swap`);
      deps.quit();
      return;
    }
    if (isRemindLaterChoice(answer)) {
      const at = remindAfter(answer, deps.now());
      try {
        deps.reminders.write(at);
        deps.log.info(`Update later (${answer}): not asking again before ${at.toISOString()}`);
      } catch (error) {
        deps.log.error(`the Update later choice could not be saved: ${describeError(error)}`);
      }
      return;
    }
    deps.log.info('update prompt closed without an answer; asking again at the next open');
  };

  return {
    async onWindowOpened(): Promise<WindowOpenOutcome> {
      if (prompting) return 'already-prompting';

      const decision = decideUpdate({
        runningTree: deps.runningTree,
        lastBuiltSha: deps.runningTree === null ? null : lastBuiltSha(),
        buildOnDisk: deps.buildOnDisk,
        remindAfter: deps.reminders.read(),
        now: deps.now(),
      });
      if (decision.kind === 'none') return 'none';
      if (decision.kind === 'snoozed') return 'snoozed';

      if (deps.testMode) {
        deps.record('update-prompt', { tree: decision.tree });
        deps.log.info(`update prompt recorded (test mode) for build ${decision.tree}`);
        return 'recorded';
      }

      prompting = true;
      try {
        deps.log.info(`build ${decision.tree} is newer than the running build; asking`);
        const answer = await deps.showPrompt(decision.tree);
        await act(decision.tree, answer);
      } catch (error) {
        deps.log.error(`the update prompt failed: ${describeError(error)}`);
      } finally {
        prompting = false;
      }
      return 'prompted';
    },
  };
}
