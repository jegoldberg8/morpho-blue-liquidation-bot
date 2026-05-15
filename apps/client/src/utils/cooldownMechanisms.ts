import { Address, Hex } from "viem";

export class PositionLiquidationCooldownMechanism {
  private cooldownPeriod: number;
  private positionReadyAt: Record<Hex, Record<Address, number>>;

  constructor(cooldownPeriod: number) {
    this.cooldownPeriod = cooldownPeriod;
    this.positionReadyAt = {};
  }

  isPositionReady(marketId: Hex, account: Address) {
    if (this.positionReadyAt[marketId] === undefined) {
      this.positionReadyAt[marketId] = {};
    }

    if (this.positionReadyAt[marketId][account] === undefined) {
      this.positionReadyAt[marketId][account] = 0;
    }

    return this.positionReadyAt[marketId][account] <= Date.now() / 1000;
  }

  private lastSeizable: Record<string, bigint> = {};

  cooldownPosition(marketId: Hex, account: Address, seizableCollateral: bigint) {
    this.positionReadyAt[marketId] ??= {};
    this.positionReadyAt[marketId][account] = Date.now() / 1000 + this.cooldownPeriod;
    this.lastSeizable[`${marketId}-${account}`] = seizableCollateral;
  }

  hasPositionChanged(marketId: Hex, account: Address, seizableCollateral: bigint) {
    const key = `${marketId}-${account}`;
    const last = this.lastSeizable[key];
    if (last === undefined || last === 0n) return false;
    // Only consider changed if >1% difference (ignore interest accrual noise)
    const diff = seizableCollateral > last ? seizableCollateral - last : last - seizableCollateral;
    return diff * 100n > last;
  }

  clearCooldown(marketId: Hex, account: Address) {
    if (this.positionReadyAt[marketId]) {
      this.positionReadyAt[marketId][account] = 0;
    }
  }
}

export class MarketsFetchingCooldownMechanism {
  private cooldownPeriod: number;
  private readyAt: number;

  constructor(cooldownPeriod: number) {
    this.cooldownPeriod = cooldownPeriod;
    this.readyAt = 0;
  }

  isFetchingReady() {
    if (this.readyAt > Date.now() / 1000) {
      return false;
    }
    this.readyAt = Date.now() / 1000 + this.cooldownPeriod;
    return true;
  }
}
