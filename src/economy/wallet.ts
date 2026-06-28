/** 金钱钱包：约束玩家用最少构件求优雅解。 */
export interface MoneyWallet {
  maxMoney: number;
  currentMoney: number;
}

export function createWallet(maxMoney: number): MoneyWallet {
  return { maxMoney, currentMoney: maxMoney };
}

export function canAfford(w: MoneyWallet, cost: number): boolean {
  return w.currentMoney >= cost;
}

/** 放置扣费；不足则拒绝并返回 false。 */
export function consume(w: MoneyWallet, cost: number): boolean {
  if (!canAfford(w, cost)) return false;
  w.currentMoney -= cost;
  return true;
}

/** 删除返还；不超过上限。 */
export function refund(w: MoneyWallet, amount: number): void {
  w.currentMoney = Math.min(w.maxMoney, w.currentMoney + amount);
}

/** 已消耗金钱。 */
export function actualCost(w: MoneyWallet): number {
  return w.maxMoney - w.currentMoney;
}

export function isFrugal(consumed: number, frugalMoney: number): boolean {
  return consumed <= frugalMoney;
}
