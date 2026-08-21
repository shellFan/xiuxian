export interface RandomProvider {
  next(): number;
}

export class MathRandomProvider implements RandomProvider {
  public next(): number { return Math.random(); }
}

export class FixedRandomProvider implements RandomProvider {
  public constructor(private readonly value: number) { validateRandom(value); }
  public next(): number { return this.value; }
}

export class SequenceRandomProvider implements RandomProvider {
  private index = 0;
  public constructor(private readonly values: readonly number[]) {
    if (values.length === 0) throw new Error('Random sequence must not be empty');
    values.forEach(validateRandom);
  }
  public next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    return value;
  }
}

export class FakeRandomProvider extends SequenceRandomProvider {}
export const DEFAULT_RANDOM_PROVIDER: RandomProvider = new MathRandomProvider();

function validateRandom(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random value must be in [0, 1)');
}
