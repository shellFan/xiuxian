export type FateEventCategory = 'WORKPLACE' | 'ENCOUNTER' | 'DANGER' | 'RELATIONSHIP' | 'CHAIN' | 'HIDDEN';

export interface FateEventOutcome {
  readonly text: string;
  readonly health?: number;
  readonly mind?: number;
  readonly salary?: number;
  readonly cultivation?: number;
  readonly performance?: number;
  readonly relationship?: Readonly<Record<string, number>>;
  readonly materials?: Readonly<Record<string, number>>;
  readonly setFlags?: readonly string[];
  readonly clearFlags?: readonly string[];
  readonly nextEventId?: string;
  readonly challengeId?: string;
  readonly lifePurchase?: 'COFFEE' | 'MILK_TEA' | 'LUNCH' | 'SNACK' | 'DINNER';
  readonly endingId?: string;
  readonly deathEnding?: boolean;
  readonly combatModifier?: {
    readonly id: string;
    readonly durationSeconds: number;
    readonly attackMultiplier?: number;
    readonly critChanceDelta?: number;
    readonly autoIntervalMultiplier?: number;
    readonly skillCooldownMultiplier?: number;
  };
}

export interface FateEventOption {
  readonly id: string;
  readonly text: string;
  readonly successChance?: number;
  readonly requirements?: {
    readonly profession?: string;
    readonly equipment?: string;
    readonly technique?: string;
    readonly minCareer?: number;
    readonly minMind?: number;
    readonly requiredFlags?: readonly string[];
    readonly relationship?: Readonly<Record<string, number>>;
  };
  readonly success: FateEventOutcome;
  readonly failure: FateEventOutcome;
}

export interface FateEventDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: FateEventCategory;
  readonly weight: number;
  readonly trigger: { readonly milestone?: string; readonly chainId?: string; readonly chainStage?: number };
  readonly chainId?: string;
  readonly chainStage?: number;
  readonly hidden?: boolean;
  readonly requiredFlags?: readonly string[];
  readonly options: readonly FateEventOption[];
}

export interface FateEventContentValidation {
  readonly errors: readonly string[];
  readonly chainIds: readonly string[];
  readonly endingIds: readonly string[];
  readonly deathEndingIds: readonly string[];
}

const CATEGORIES = new Set<FateEventCategory>(['WORKPLACE', 'ENCOUNTER', 'DANGER', 'RELATIONSHIP', 'CHAIN', 'HIDDEN']);
const MAX_EFFECT = 10_000;

/** Validates authored fate content without loading game services or touching player state. */
export function validateFateEventContent(events: readonly FateEventDefinition[]): FateEventContentValidation {
  const errors: string[] = [];
  const byId = new Map<string, FateEventDefinition>();
  for (const event of events) {
    if (!isBoundedString(event.id, 96)) errors.push(`invalid event id: ${String(event.id)}`);
    else if (byId.has(event.id)) errors.push(`duplicate event id: ${event.id}`);
    else byId.set(event.id, event);
    if (!isBoundedString(event.title, 100) || !isBoundedString(event.description, 500)) errors.push(`invalid copy: ${event.id}`);
    if (!CATEGORIES.has(event.category)) errors.push(`invalid category: ${event.id}`);
    if (!Number.isFinite(event.weight) || event.weight <= 0 || event.weight > 1_000_000) errors.push(`invalid weight: ${event.id}`);
    if (!event.trigger || (!isBoundedString(event.trigger.milestone, 96) && (!isBoundedString(event.trigger.chainId, 96) || !isPositiveInteger(event.trigger.chainStage)))) errors.push(`invalid trigger: ${event.id}`);
    if (event.hidden && (!event.requiredFlags?.length || !event.requiredFlags.every((flag) => isBoundedString(flag, 96)))) errors.push(`hidden event without gate: ${event.id}`);
    if (event.chainId && (!isBoundedString(event.chainId, 64) || !isPositiveInteger(event.chainStage))) errors.push(`invalid chain stage: ${event.id}`);
    if (!Array.isArray(event.options) || event.options.length < 2 || event.options.length > 3) {
      errors.push(`invalid options: ${event.id}`);
      continue;
    }
    const choiceIds = new Set<string>();
    for (const option of event.options) {
      if (!isBoundedString(option.id, 64) || choiceIds.has(option.id)) errors.push(`invalid or duplicate option: ${event.id}`);
      choiceIds.add(option.id);
      if (!isBoundedString(option.text, 160)) errors.push(`invalid option copy: ${event.id}/${option.id}`);
      if (option.successChance !== undefined && (!Number.isFinite(option.successChance) || option.successChance < 0 || option.successChance > 1)) errors.push(`invalid successChance: ${event.id}/${option.id}`);
      validateOutcome(event.id, option.id, option.success, errors);
      validateOutcome(event.id, option.id, option.failure, errors);
    }
  }

  const endingIds = new Set<string>();
  const deathEndingIds = new Set<string>();
  for (const event of byId.values()) for (const option of event.options) {
    for (const outcome of [option.success, option.failure]) {
      if (outcome.nextEventId && !byId.has(outcome.nextEventId)) errors.push(`missing next event ${outcome.nextEventId} from ${event.id}`);
      if (outcome.endingId) {
        endingIds.add(outcome.endingId);
        if (outcome.deathEnding) deathEndingIds.add(outcome.endingId);
      }
    }
  }

  const chainIds = Array.from(new Set(Array.from(byId.values()).flatMap((event) => event.chainId ? [event.chainId] : [])));
  for (const chainId of chainIds) {
    const chain = Array.from(byId.values()).filter((event) => event.chainId === chainId);
    const stages = new Set(chain.map((event) => event.chainStage));
    for (let stage = 1; stage <= 5; stage += 1) if (!stages.has(stage)) errors.push(`chain ${chainId} missing stage ${stage}`);
    if (chain.length < 5) errors.push(`chain ${chainId} has fewer than five events`);
    const reachable = new Set<string>(chain.filter((event) => event.chainStage === 1).map((event) => event.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const event of chain) {
        if (!reachable.has(event.id)) continue;
        for (const option of event.options) for (const outcome of [option.success, option.failure]) {
          if (outcome.nextEventId && chain.some((candidate) => candidate.id === outcome.nextEventId) && !reachable.has(outcome.nextEventId)) {
            reachable.add(outcome.nextEventId);
            changed = true;
          }
        }
      }
    }
    for (const event of chain) if (!reachable.has(event.id)) errors.push(`unreachable chain event ${event.id}`);
  }

  if (byId.size < 30) errors.push(`expected at least 30 unique events; found ${byId.size}`);
  if (Array.from(byId.values()).filter((event) => event.options.length === 3).length < 20) errors.push('expected at least 20 three-choice events');
  if (Array.from(byId.values()).filter((event) => event.options.some((option) => option.successChance !== undefined)).length < 10) errors.push('expected at least 10 probability-branch events');
  if (chainIds.length < 5) errors.push('expected at least five story chains');
  if (Array.from(byId.values()).filter((event) => event.hidden).length < 3) errors.push('expected at least three hidden events');
  if (endingIds.size < 5) errors.push('expected at least five run endings');
  if (deathEndingIds.size < 3) errors.push('expected at least three death endings');
  return { errors, chainIds, endingIds: [...endingIds], deathEndingIds: [...deathEndingIds] };
}

function validateOutcome(eventId: string, optionId: string, outcome: FateEventOutcome, errors: string[]): void {
  if (!outcome || !isBoundedString(outcome.text, 300)) errors.push(`invalid outcome copy: ${eventId}/${optionId}`);
  for (const field of ['health', 'mind', 'salary', 'cultivation', 'performance'] as const) {
    if (outcome[field] !== undefined && (!Number.isSafeInteger(outcome[field]) || Math.abs(outcome[field]) > MAX_EFFECT)) errors.push(`invalid ${field}: ${eventId}/${optionId}`);
  }
  for (const [npcId, delta] of Object.entries(outcome.relationship ?? {})) {
    if (!isBoundedString(npcId, 48) || !Number.isSafeInteger(delta) || Math.abs(delta) > 100) errors.push(`invalid relationship: ${eventId}/${optionId}`);
  }
  for (const [itemId, amount] of Object.entries(outcome.materials ?? {})) {
    if (!isBoundedString(itemId, 48) || !Number.isSafeInteger(amount) || Math.abs(amount) > 100) errors.push(`invalid materials: ${eventId}/${optionId}`);
  }
  for (const flag of [...(outcome.setFlags ?? []), ...(outcome.clearFlags ?? [])]) if (!isBoundedString(flag, 96)) errors.push(`invalid flag: ${eventId}/${optionId}`);
  if (outcome.endingId && !isBoundedString(outcome.endingId, 96)) errors.push(`invalid ending id: ${eventId}/${optionId}`);
  if (outcome.deathEnding && !outcome.endingId) errors.push(`death outcome missing ending id: ${eventId}/${optionId}`);
  if (outcome.lifePurchase !== undefined && !['COFFEE', 'MILK_TEA', 'LUNCH', 'SNACK', 'DINNER'].includes(outcome.lifePurchase)) errors.push(`invalid life purchase: ${eventId}/${optionId}`);
  if (outcome.combatModifier) {
    const modifier = outcome.combatModifier;
    if (!isBoundedString(modifier.id, 64) || !isPositiveInteger(modifier.durationSeconds) || modifier.durationSeconds > 86_400) errors.push(`invalid combat modifier: ${eventId}/${optionId}`);
    if (modifier.attackMultiplier !== undefined && (!Number.isFinite(modifier.attackMultiplier) || modifier.attackMultiplier < 0.25 || modifier.attackMultiplier > 3)) errors.push(`invalid attack multiplier: ${eventId}/${optionId}`);
    if (modifier.critChanceDelta !== undefined && (!Number.isFinite(modifier.critChanceDelta) || modifier.critChanceDelta < -0.5 || modifier.critChanceDelta > 0.5)) errors.push(`invalid crit modifier: ${eventId}/${optionId}`);
    if (modifier.autoIntervalMultiplier !== undefined && (!Number.isFinite(modifier.autoIntervalMultiplier) || modifier.autoIntervalMultiplier < 0.25 || modifier.autoIntervalMultiplier > 3)) errors.push(`invalid auto interval modifier: ${eventId}/${optionId}`);
    if (modifier.skillCooldownMultiplier !== undefined && (!Number.isFinite(modifier.skillCooldownMultiplier) || modifier.skillCooldownMultiplier < 0.25 || modifier.skillCooldownMultiplier > 3)) errors.push(`invalid skill cooldown modifier: ${eventId}/${optionId}`);
  }
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}
function isPositiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
