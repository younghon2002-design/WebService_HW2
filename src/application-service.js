import { AppError, missing, forbidden, invalidState } from './errors.js';

// TODO-01~04: 업무 규칙과 트랜잭션을 직접 구현합니다. docs/API.md를 먼저 읽으세요.
// actor는 검증된 로그인 사용자입니다. repo의 저장 함수는 권한을 검사하지 않습니다.
// 상태 변경과 이력 저장은 함께 성공하거나 함께 실패해야 합니다.
// 승인 취소와 자동 승급은 신청 2건 + 이력 2건을 한 트랜잭션으로 처리합니다.
export function createApplicationService(repo) {
  const db = repo.db;

  function withTransaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try{
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK');

      } catch {}
      throw err;
    }
  }

  return {
    apply(actor,eventId) {
      return withTransaction(() => {
        const event = repo.event(eventId);
        if(!event) throw missing('행사');

        if (actor.role !=='STUDENT') throw forbidden();

        if (repo.existing(eventId, actor.id)) {
          throw new AppError(409, 'ALREADY_APPLIED', '이미 신청한 행사입니다.');
        }

        let application;
        try {
          application = repo.insert(eventId, actor.id);
        } catch (err) {
          if (String(err.message).includes('UNIQUE constraint failed')) {
            throw new AppError(409, 'ALREADY_APPLIED', '이미 신청한 행사입니다.');
          }
          throw err;
        }

        repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'APPLY',
          fromStatus: null,
          toStatus: 'PENDING',
        });
        return application;
      });
    },
    cancel(actor,applicationId) {
      return withTransaction(() => {
        const application = repo.application(applicationId);
        if (!application) throw missing('신청');

        if (application.userId !== actor.id) throw forbidden();

        if (application.status !== 'PENDING') throw invalidState();

        const cancelled = repo.setStatus(application.id, 'CANCELLED');

        repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'CANCEL',
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
        });
        return cancelled;
      });
    },

    approve(actor,applicationId) {
      // TODO-03: 담당자·PENDING·정원 검사 → APPROVED + APPROVE 이력.
      // 직접 승인은 운영자가 선택합니다. FIFO는 승인 취소 때의 자동 승급에 적용합니다.
      throw new AppError(501,'NOT_IMPLEMENTED','TODO-03 승인과 이력을 구현하세요.');
    },
    revoke(actor,applicationId,reason) {
      // TODO-04: 담당자·APPROVED 검사 → REVOKED + REVOKE 이력.
      // 같은 행사 PENDING 중 created_at ASC, id ASC 첫 1건을 자동 승인합니다.
      // AUTO_APPROVE 이력의 causeHistoryId는 이 요청의 REVOKE 이력 ID입니다.
      // 상태와 이력의 부분 저장을 막고, 거부·오류 시 전체를 되돌리세요.
      // 반환: {revoked: 신청 객체, promoted: 신청 객체 또는 null}.
      throw new AppError(501,'NOT_IMPLEMENTED','TODO-04 승인 취소·자동 승급·이력을 구현하세요.');
    }
  };
}
