import { runAdminAuthCall, type AdminActionLogger } from '@/lib/admin/auth-call';
import { assert, finish, section } from './lib/check-harness';

type LogCall = { fields: Record<string, unknown>; message: string };

function makeLogger() {
  const errors: LogCall[] = [];
  const infos: LogCall[] = [];
  const log: AdminActionLogger = {
    error: (fields, message) => {
      errors.push({ fields, message });
    },
    info: (fields, message) => {
      infos.push({ fields, message });
    },
  };
  return { log, errors, infos };
}

async function main(): Promise<void> {
  section('runAdminAuthCall — success');
  {
    const { log, errors, infos } = makeLogger();
    const result = await runAdminAuthCall(async () => 'ignored', {
      log,
      adminId: 'admin-1',
      targetUserId: 'user-1',
      failureLogMessage: 'banUser (suspend) failed',
      failureErrPrefix: 'Failed to suspend user',
    });
    assert(result.ok, 'returns ok when the call resolves');
    assert(result.ok && result.data === null, 'ok payload is null');
    assert(errors.length === 0, 'logs nothing on success');
    assert(infos.length === 0, 'logs nothing extra on success');
  }

  section('runAdminAuthCall — thrown Error');
  {
    const { log, errors, infos } = makeLogger();
    const result = await runAdminAuthCall(
      async () => {
        throw new Error('boom');
      },
      {
        log,
        adminId: 'admin-1',
        targetUserId: 'user-1',
        failureLogMessage: 'banUser (suspend) failed',
        failureErrPrefix: 'Failed to suspend user',
      },
    );
    assert(!result.ok, 'returns err when the call throws');
    assert(
      !result.ok && result.error === 'Failed to suspend user: boom',
      'error is `${prefix}: ${message}`',
    );
    assert(errors.length === 1, 'logs exactly one error');
    assert(errors[0]?.message === 'banUser (suspend) failed', 'log message is the failure label');
    assert(
      errors[0]?.fields.adminId === 'admin-1' &&
        errors[0]?.fields.targetUserId === 'user-1' &&
        errors[0]?.fields.error === 'boom',
      'log fields carry adminId / targetUserId / error',
    );
    assert(infos.length === 0, 'logs nothing extra on failure');
  }

  section('runAdminAuthCall — non-Error throw');
  {
    const { log, infos } = makeLogger();
    const result = await runAdminAuthCall(
      async () => {
        throw 'string failure';
      },
      {
        log,
        adminId: 'a',
        targetUserId: 'u',
        failureLogMessage: 'x failed',
        failureErrPrefix: 'Failed to x user',
      },
    );
    assert(
      !result.ok && result.error === 'Failed to x user: string failure',
      'non-Error throws are String()-ed',
    );
    assert(infos.length === 0, 'logs nothing extra on failure');
  }

  finish('runAdminAuthCall checks passed');
}

main();
