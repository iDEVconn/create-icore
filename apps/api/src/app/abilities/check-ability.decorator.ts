import { SetMetadata } from '@nestjs/common';
import type { AbilityAction, AbilitySubject } from '@icore/shared';

export const CHECK_ABILITY_KEY = 'checkAbility';

export interface RequiredRule {
  action: AbilityAction;
  subject: AbilitySubject;
}

export const CheckAbility = (action: AbilityAction, subject: AbilitySubject) =>
  SetMetadata(CHECK_ABILITY_KEY, { action, subject } satisfies RequiredRule);
