import { Inject, Injectable } from '@nestjs/common';
import { CallReaperService } from './application/call-reaper.service.js';
@Injectable()
export class CallingFacade {
  constructor(
    @Inject(CallReaperService) private readonly reaper: CallReaperService,
  ) {}
  reap(shouldStop: () => boolean = () => false) {
    return this.reaper.reap(shouldStop);
  }
}
