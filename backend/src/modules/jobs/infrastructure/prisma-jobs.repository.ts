import { Inject, Injectable } from '@nestjs/common';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { JobsRepository } from '../application/jobs.repository.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class PrismaJobsRepository extends JobsRepository {
  constructor(
    @Inject(DatabaseUnitOfWork)
    private readonly transactions: DatabaseUnitOfWork,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {
    super();
  }
  async busyDriverIds(ids: string[]) {
    return (
      await this.database.client.activeJobAssignment.findMany({
        where: { driverUserId: { in: ids.slice(0, 50) } },
        select: { driverUserId: true },
      })
    ).map((row) => row.driverUserId);
  }
  private client(context: TransactionContext) {
    return this.transactions.client(context);
  }
  async create(
    context: TransactionContext,
    id: string,
    customerUserId: string,
    jobType: 'RIDE' | 'DELIVERY',
  ) {
    await this.client(context).mobilityJob.create({
      data: { id, customerUserId, jobType },
    });
  }
  async lock(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM mobility_jobs WHERE id=${id}::uuid FOR UPDATE`;
  }
  async driverBusy(context: TransactionContext, driverUserId: string) {
    return !!(await this.client(context).activeJobAssignment.findUnique({
      where: { driverUserId },
      select: { driverUserId: true },
    }));
  }
  async claim(context: TransactionContext, id: string, driverUserId: string) {
    const job = await this.client(context).mobilityJob.findUnique({
      where: { id },
    });
    if (!job || job.closedAt)
      throw new BusinessError('INVALID_TRANSITION', 'Job is not active');
    const created = await this.client(context).activeJobAssignment.createMany({
      data: [{ mobilityJobId: id, driverUserId }],
      skipDuplicates: true,
    });
    if (created.count === 0) {
      const assigned = await this.client(
        context,
      ).activeJobAssignment.findUnique({ where: { mobilityJobId: id } });
      throw new BusinessError(
        assigned ? 'RIDE_ALREADY_ASSIGNED' : 'DRIVER_BUSY',
        assigned ? 'Ride already assigned' : 'Driver already has an active job',
      );
    }
  }
  async close(context: TransactionContext, id: string) {
    await this.client(context).activeJobAssignment.deleteMany({
      where: { mobilityJobId: id },
    });
    await this.client(context).mobilityJob.update({
      where: { id },
      data: { closedAt: new Date() },
    });
  }
  async activeForUser(context: TransactionContext, userId: string) {
    const client = this.client(context);
    return (
      (await this.driverBusy(context, userId)) ||
      (await client.mobilityJob.count({
        where: { customerUserId: userId, closedAt: null },
      })) > 0
    );
  }
}
